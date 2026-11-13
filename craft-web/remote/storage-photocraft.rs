//! Page storage through `window.craftStorage` (craft-storage.js): Open and Save offer the places
//! the page lends next to this device, and a document opened from a place keeps its `cloud:` path,
//! so Save writes it back.
//!
//! It also gives the control channel (an AI assistant through the craft-mcp relay) file access.
//! The desktop app grants that with --automation-read-root and --automation-write-root; the
//! browser has no file system, so `app.open`, `app.save` and `ui.screenshot` with a path go to
//! craft-storage instead: the workspace of an editor that frames the page, or another place.
//! craft-storage works with promises and these services answer at once, so craft-remote.js reads
//! the file before `app.open` arrives, and waits for the writes after each request.

use std::cell::RefCell;
use std::rc::Rc;

use __UI__::{AutomationReadResult, FileDialogAnswer, FileDialogRequest, Services};
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::JsFuture;

const SCHEME: &str = "cloud:";

fn storage() -> Option<JsValue> {
    let window: JsValue = web_sys::window()?.into();
    let storage = js_sys::Reflect::get(&window, &"craftStorage".into()).ok()?;
    (!storage.is_undefined()).then_some(storage)
}

async fn call(method: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
    let storage = storage().ok_or(JsValue::NULL)?;
    let f: js_sys::Function = js_sys::Reflect::get(&storage, &method.into())?.into();
    let promise: js_sys::Promise = f.apply(&storage, &args.iter().collect::<js_sys::Array>())?.into();
    JsFuture::from(promise).await
}

/// Call `craftStorage.<method>(args)` and get its answer now (the method must not return a promise).
fn call_now(method: &str, args: &[JsValue]) -> Result<JsValue, String> {
    let storage = storage().ok_or("this page has no file storage for the assistant")?;
    let f: js_sys::Function = js_sys::Reflect::get(&storage, &method.into()).map_err(|_| "craft-storage is too old")?.into();
    f.apply(&storage, &args.iter().collect::<js_sys::Array>()).map_err(|e| e.as_string().unwrap_or_else(|| "craft-storage failed".into()))
}

fn install_automation(services: &mut Services) {
    if services.automation_read.is_none() {
        services.automation_read = Some(Box::new(|path: &str| {
            // An object {name, bytes}, or a string saying why there is nothing.
            let got = call_now("automationRead", &[path.into()])?;
            if let Some(error) = got.as_string() {
                return Err(error);
            }
            let name = js_sys::Reflect::get(&got, &"name".into()).ok().and_then(|n| n.as_string()).unwrap_or_else(|| path.to_string());
            let bytes = js_sys::Reflect::get(&got, &"bytes".into()).map(|b| js_sys::Uint8Array::new(&b).to_vec()).unwrap_or_default();
            // Save without a path writes back to the same place.
            Ok(AutomationReadResult { name, bytes, save_path: Some(path.to_string()) })
        }));
    }
    if services.automation_write.is_none() {
        services.automation_write = Some(Box::new(|path: &str, bytes: &[u8]| {
            // null: the write has started (craft-remote.js reports its end); a string: refused.
            let started = call_now("automationWrite", &[path.into(), js_sys::Uint8Array::from(bytes).into()])?;
            match started.as_string() {
                Some(error) => Err(error),
                None => Ok(()),
            }
        }));
    }
}

pub fn install(services: &mut Services) {
    install_automation(services);
    let Some(device_dialog) = services.file_dialog.take() else { return };
    let device_dialog = Rc::new(RefCell::new(device_dialog));
    services.file_dialog = Some(Box::new(move |request, parent, reply| {
        if storage().is_none() {
            return (device_dialog.borrow_mut())(request, parent, reply);
        }
        let device_dialog = device_dialog.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let choice = match &request {
                FileDialogRequest::Open { extensions, .. } => {
                    let exts = extensions.as_ref().map_or(JsValue::NULL, |e| e.iter().map(JsValue::from).collect::<js_sys::Array>().into());
                    call("chooseOpen", &[exts]).await
                }
                FileDialogRequest::Save { suggested } => call("chooseSave", &[suggested.into()]).await,
                // Folder (photocraft 0.8.2+) and any later kind: the cloud has no folders, so this device answers.
                #[allow(unreachable_patterns)]
                _ => return (device_dialog.borrow_mut())(request, None, reply),
            };
            match choice {
                Ok(c) if c.as_string().as_deref() == Some("device") || c.is_undefined() => (device_dialog.borrow_mut())(request, None, reply),
                Ok(c) if c.is_null() => reply.send(None),
                Ok(c) => {
                    let answer = match c.as_string() {
                        Some(path) => FileDialogAnswer::SaveTo(path),
                        None => {
                            let path = js_sys::Reflect::get(&c, &"path".into()).ok().and_then(|p| p.as_string()).unwrap_or_default();
                            let bytes = js_sys::Reflect::get(&c, &"bytes".into()).map(|b| js_sys::Uint8Array::new(&b).to_vec()).unwrap_or_default();
                            FileDialogAnswer::Contents(path, bytes)
                        }
                    };
                    reply.send(Some(answer));
                }
                Err(_) => (device_dialog.borrow_mut())(request, None, reply),
            }
        });
    }));
    let Some(mut device_write) = services.write.take() else { return };
    services.write = Some(Box::new(move |path: &str, bytes: &[u8]| {
        if !path.starts_with(SCHEME) {
            return device_write(path, bytes);
        }
        let args = [JsValue::from(path), js_sys::Uint8Array::from(bytes).into()];
        // craft-storage.js reports progress and failures itself.
        wasm_bindgen_futures::spawn_local(async move {
            let _ = call("write", &args).await;
        });
        Ok(())
    }));
}
