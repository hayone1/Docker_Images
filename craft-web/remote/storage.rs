//! Cloud storage through `window.craftStorage` (craft-storage.js): Open and Save offer the cloud
//! next to this device, and a document opened from the cloud keeps its `cloud:` path, so Save
//! writes it back.

use std::cell::RefCell;
use std::rc::Rc;

use __UI__::{FileDialogAnswer, FileDialogRequest, Services};
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::JsFuture;

const SCHEME: &str = "cloud:";

fn storage() -> Option<JsValue> {
    let storage = js_sys::Reflect::get(&web_sys::window()?, &"craftStorage".into()).ok()?;
    (!storage.is_undefined()).then_some(storage)
}

async fn call(method: &str, args: &[JsValue]) -> Result<JsValue, JsValue> {
    let storage = storage().ok_or(JsValue::NULL)?;
    let f: js_sys::Function = js_sys::Reflect::get(&storage, &method.into())?.into();
    let promise: js_sys::Promise = f.apply(&storage, &args.iter().collect::<js_sys::Array>())?.into();
    JsFuture::from(promise).await
}

pub fn install(services: &mut Services) {
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
