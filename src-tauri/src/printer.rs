//! Transporte de impresión ESC/POS (tarea 4.5): los bytes los genera el
//! frontend (testeados); aquí solo viajan al hardware. USB (clase 7) o
//! red TCP 9100. REGLA: un fallo aquí JAMÁS bloquea la venta — el error
//! vuelve al frontend, que ofrece reimprimir.

use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use rusb::{Direction, TransferType, UsbContext};

#[tauri::command]
pub async fn print_raw(bytes: Vec<u8>, transport: String, host: Option<String>) -> Result<(), String> {
    match transport.as_str() {
        "network" => {
            let host = host.ok_or("Configura la IP de la impresora de red.")?;
            print_network(&bytes, &host)
        }
        "usb" => print_usb(&bytes),
        other => Err(format!("Transporte de impresora desconocido: {other}")),
    }
}

/// Impresoras de red: protocolo RAW al puerto 9100
fn print_network(bytes: &[u8], host: &str) -> Result<(), String> {
    let address = format!("{host}:9100");
    let socket_address = address
        .to_socket_addrs()
        .map_err(|e| format!("Dirección de impresora inválida ({host}): {e}"))?
        .next()
        .ok_or_else(|| format!("No se pudo resolver {host}"))?;

    let mut stream = TcpStream::connect_timeout(&socket_address, Duration::from_secs(3))
        .map_err(|e| format!("Sin conexión con la impresora en {host}: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    stream
        .write_all(bytes)
        .map_err(|e| format!("La impresora no recibió el ticket: {e}"))?;

    Ok(())
}

/// Impresoras USB: primera interfaz clase 7 (printer) con endpoint bulk OUT
fn print_usb(bytes: &[u8]) -> Result<(), String> {
    let context = rusb::Context::new().map_err(|e| e.to_string())?;
    let devices = context.devices().map_err(|e| e.to_string())?;

    for device in devices.iter() {
        let Ok(config) = device.active_config_descriptor() else {
            continue;
        };

        for interface in config.interfaces() {
            for descriptor in interface.descriptors() {
                if descriptor.class_code() != 7 {
                    continue; // no es impresora
                }

                let Some(endpoint) = descriptor.endpoint_descriptors().find(|e| {
                    e.direction() == Direction::Out && e.transfer_type() == TransferType::Bulk
                }) else {
                    continue;
                };

                let handle = device
                    .open()
                    .map_err(|e| format!("Impresora encontrada pero no se pudo abrir: {e}"))?;
                let _ = handle.set_auto_detach_kernel_driver(true);
                handle
                    .claim_interface(descriptor.interface_number())
                    .map_err(|e| format!("La impresora está ocupada por otro programa: {e}"))?;

                let result = handle
                    .write_bulk(endpoint.address(), bytes, Duration::from_secs(5))
                    .map_err(|e| format!("La impresora no recibió el ticket: {e}"));
                let _ = handle.release_interface(descriptor.interface_number());

                return result.map(|_| ());
            }
        }
    }

    Err("No se encontró una impresora USB. ¿Está conectada y encendida?".into())
}
