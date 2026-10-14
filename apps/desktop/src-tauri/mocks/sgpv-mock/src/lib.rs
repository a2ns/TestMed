//! Mock de la bibliothèque FSV (`sgpv.dll`) pour développement et tests :
//! simule un lecteur de carte Vitale avec une carte de démonstration.
//! Ne jamais utiliser en production.

use std::cell::Cell;

thread_local! {
    static SESSION_OUVERTE: Cell<bool> = const { Cell::new(false) };
}

const FLUX_VITALE: &str = "0127102030405067&02DUPONT&03JEAN/MARIE&0419800101&051&0612 RUE DES LILAS 75000 PARIS&07DR MARTIN";
const FLUX_CPS: &str = "0110100123456&02DR MARTIN&03MEDECINE GENERALE";

#[no_mangle]
pub extern "system" fn SGPV_OuvrirSession(_h: *mut *mut u8, _resource: *const i8, _mode: u16) -> u16 {
    SESSION_OUVERTE.with(|s| s.set(true));
    0
}

#[no_mangle]
pub extern "system" fn SGPV_LireVitale(_h: *mut u8, buf: *mut u8, taille: *mut u32) -> u16 {
    unsafe { copier_flux(FLUX_VITALE, buf, taille) }
}

#[no_mangle]
pub extern "system" fn SGPV_LireCPS(_h: *mut u8, buf: *mut u8, taille: *mut u32) -> u16 {
    unsafe { copier_flux(FLUX_CPS, buf, taille) }
}

#[no_mangle]
pub extern "system" fn SGPV_FermerSession(_h: *mut u8) -> u16 {
    SESSION_OUVERTE.with(|s| s.set(false));
    0
}

unsafe fn copier_flux(flux: &str, buf: *mut u8, taille: *mut u32) -> u16 {
    if buf.is_null() || taille.is_null() {
        return 1;
    }
    let octets = flux.as_bytes();
    if (*taille as usize) < octets.len() {
        return 2;
    }
    std::ptr::copy_nonoverlapping(octets.as_ptr(), buf, octets.len());
    *taille = octets.len() as u32;
    0
}
