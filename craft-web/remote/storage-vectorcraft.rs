//! Cloud storage through `window.craftStorage` (craft-storage.js): File › Open offers the cloud
//! next to this device, a document opened from the cloud keeps its `cloud:` path so Save writes
//! it back, and other downloads (Save As, exports) ask where to go.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::{Arc, Mutex};

use __UI__::Services;
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::JsFuture;

type Inbox = Arc<Mutex<Vec<(String, Vec<u8>)>>>;

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

fn write(path: String, bytes: &[u8]) {
    let args = [JsValue::from(path), js_sys::Uint8Array::from(bytes).into()];
    wasm_bindgen_futures::spawn_local(async move {
        let _ = call("write", &args).await;
    });
}

pub fn install(services: &mut Services, inbox: Inbox, ctx: egui::Context) {
    if let Some(device_open) = services.open_async.take() {
        let device_open = Rc::new(RefCell::new(device_open));
        services.open_async = Some(Box::new(move || {
            if storage().is_none() {
                return (device_open.borrow_mut())();
            }
            let (device_open, inbox, ctx) = (device_open.clone(), inbox.clone(), ctx.clone());
            wasm_bindgen_futures::spawn_local(async move {
                match call("chooseOpen", &[JsValue::NULL]).await {
                    Ok(c) if c.is_null() => {}
                    Ok(c) if c.is_object() => {
                        let path = js_sys::Reflect::get(&c, &"path".into()).ok().and_then(|p| p.as_string()).unwrap_or_default();
                        let bytes = js_sys::Reflect::get(&c, &"bytes".into()).map(|b| js_sys::Uint8Array::new(&b).to_vec()).unwrap_or_default();
                        inbox.lock().unwrap_or_else(|e| e.into_inner()).push((path, bytes));
                        ctx.request_repaint();
                    }
                    _ => (device_open.borrow_mut())(),
                }
            });
        }));
    }
    let Some(device_download) = services.download.take() else { return };
    let device_download = Rc::new(RefCell::new(device_download));
    services.download = Some(Box::new(move |name: &str, bytes: &[u8]| {
        if name.starts_with("cloud:") {
            write(name.to_string(), bytes);
            return Ok(());
        }
        if storage().is_none() {
            return (device_download.borrow_mut())(name, bytes);
        }
        let (device_download, name, bytes) = (device_download.clone(), name.to_string(), bytes.to_vec());
        wasm_bindgen_futures::spawn_local(async move {
            match call("chooseSave", &[name.clone().into()]).await {
                Ok(c) if c.is_null() => {}
                Ok(c) if c.as_string().is_some_and(|p| p.starts_with("cloud:")) => write(c.as_string().unwrap_or_default(), &bytes),
                _ => {
                    let _ = (device_download.borrow_mut())(&name, &bytes);
                }
            }
        });
        Ok(())
    }));
}
