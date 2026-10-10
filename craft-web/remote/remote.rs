//! `window.craftRemote.request(method, params)`: the desktop control channel
//! (`docs/control-protocol.md`) as a promise of the full reply envelope.

use std::cell::RefCell;
use std::sync::mpsc::{Receiver, Sender, TryRecvError, channel};

use __UI__::ControlRequest;
use serde_json::{Value, json};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

type Pending = (Receiver<Value>, js_sys::Function);

thread_local! {
    static TX: RefCell<Option<(Sender<ControlRequest>, egui::Context)>> = const { RefCell::new(None) };
    static PENDING: RefCell<Vec<Pending>> = const { RefCell::new(Vec::new()) };
}

pub fn install(ctx: &egui::Context) -> Receiver<ControlRequest> {
    let (tx, rx) = channel();
    TX.with(|t| *t.borrow_mut() = Some((tx, ctx.clone())));
    let request = Closure::<dyn Fn(String, JsValue) -> js_sys::Promise>::new(request);
    let poll = Closure::<dyn Fn()>::new(poll);
    if let Some(w) = web_sys::window() {
        let obj = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&obj, &"request".into(), request.as_ref());
        let _ = js_sys::Reflect::set(&w, &"craftRemote".into(), &obj);
        let _ = w.set_interval_with_callback_and_timeout_and_arguments_0(poll.as_ref().unchecked_ref(), 20);
    }
    request.forget();
    poll.forget();
    rx
}

fn to_js(v: &Value) -> JsValue {
    js_sys::JSON::parse(&v.to_string()).unwrap_or(JsValue::NULL)
}

fn request(method: String, params: JsValue) -> js_sys::Promise {
    let params = js_sys::JSON::stringify(&params)
        .ok()
        .and_then(|s| s.as_string())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    js_sys::Promise::new(&mut |resolve, _reject| {
        let (req, reply) = ControlRequest::new(method.clone(), params.clone());
        let sent = TX.with(|t| {
            t.borrow().as_ref().is_some_and(|(tx, ctx)| {
                let ok = tx.send(req).is_ok();
                ctx.request_repaint();
                ok
            })
        });
        if sent {
            PENDING.with(|p| p.borrow_mut().push((reply, resolve)));
        } else {
            let _ = resolve.call1(&JsValue::NULL, &to_js(&json!({"ok": false, "error": "control channel closed"})));
        }
    })
}

fn poll() {
    PENDING.with(|p| {
        p.borrow_mut().retain(|(rx, resolve)| {
            let v = match rx.try_recv() {
                Ok(v) => v,
                Err(TryRecvError::Empty) => return true,
                Err(TryRecvError::Disconnected) => json!({"ok": false, "error": "request dropped by the app"}),
            };
            let _ = resolve.call1(&JsValue::NULL, &to_js(&v));
            false
        });
    });
}
