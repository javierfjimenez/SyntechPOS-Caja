mod printer;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Kiosk: la app no se cierra sin autorización de supervisor (ui-caja.md §1).
struct KioskState {
    exit_allowed: AtomicBool,
}

/// El frontend lo invoca DESPUÉS de validar el PIN de supervisor.
#[tauri::command]
fn authorize_exit(app: tauri::AppHandle) {
    app.state::<KioskState>()
        .exit_allowed
        .store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "esquema inicial (esquema.md §11)",
            sql: include_str!("../migrations/0001_esquema_inicial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "réplica completa: cost/sku en products, phone en customers",
            sql: include_str!("../migrations/0002_replica_completa.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "log local de códigos no reconocidos (ui-caja §9.2)",
            sql: include_str!("../migrations/0003_codigos_desconocidos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "tasa del departamento para venta por departamento (@3a8fb67)",
            sql: include_str!("../migrations/0004_tasa_departamento.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "cierre de sesión: closed_by, diferencia y detalle del arqueo",
            sql: include_str!("../migrations/0005_cierre_de_sesion.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let app = tauri::Builder::default()
        .manage(KioskState {
            exit_allowed: AtomicBool::new(false),
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:syntechpos-caja.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![authorize_exit, printer::print_raw])
        .setup(|app| {
            // Kiosk solo en release: en dev la ventana se maneja normal
            if !cfg!(debug_assertions) {
                let window = app
                    .get_webview_window("main")
                    .expect("la ventana principal debe existir");
                window.set_fullscreen(true)?;
                window.set_decorations(false)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if cfg!(debug_assertions) {
                    return; // en dev se cierra libre
                }
                let allowed = window
                    .app_handle()
                    .state::<KioskState>()
                    .exit_allowed
                    .load(Ordering::SeqCst);
                if !allowed {
                    api.prevent_close();
                    // El frontend abre el modal PinAutorizacion y, si procede,
                    // invoca authorize_exit
                    let _ = window.emit("kiosk:close-requested", ());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error al construir la aplicación Tauri");

    app.run(|app_handle, event| {
        // Cmd+Q / cierre del SO (code None) también pasa por el kiosk;
        // authorize_exit sale con app.exit(0) → code Some(0), no se bloquea
        if let RunEvent::ExitRequested { api, code, .. } = event {
            if cfg!(debug_assertions) || code.is_some() {
                return;
            }
            let allowed = app_handle
                .state::<KioskState>()
                .exit_allowed
                .load(Ordering::SeqCst);
            if !allowed {
                api.prevent_exit();
                let _ = app_handle.emit("kiosk:close-requested", ());
            }
        }
    });
}
