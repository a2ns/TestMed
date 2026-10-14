# Sesam-Vitale — carte Vitale, CPS et VM Windows (UTM)

## Architecture

```
IHM React (page Patients / facturation)
        │ invoke Tauri
        ▼
commands::vitale  (lire_carte_vitale, lire_cps)
        ▼
sesam_vitale::ffi → FFI Rust → sgpv.dll (FSV du GIE SESAM-Vitale)
                                   ▲
                     lecteur de carte USB (PC/SC)
```

- `apps/desktop/src-tauri/src/sesam_vitale/ffi.rs` : liaison FFI vers `sgpv.dll`
  (Windows uniquement ; les autres OS retournent une erreur explicite).
- `apps/desktop/src-tauri/mocks/sgpv-mock` : mock `sgpv.dll` pour développement
  et tests sans lecteur ni carte (jamais en production).
- `scripts/utm/` : création de la VM Windows (UTM/macOS Apple Silicon) et
  configuration du poste.

## VM Windows (UTM, Apple Silicon)

1. `scripts/utm/creer-vm-windows.sh <chemin/Win11_ARM64.iso>` : guide la création
   de la VM (Windows 11 ARM64, 4 vCPU, 4 Go, USB activé).
2. Installer Windows, puis les Guest Tools UTM.
3. Brancher le lecteur de carte Vitale et le cocher dans la barre USB de la VM.
4. Dans la VM, PowerShell administrateur :

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\utm\configurer-poste-windows.ps1 -FsvInstalleur C:\chemin\fsv-installeur.exe
   # ou, sans matériel (dev) :
   powershell -ExecutionPolicy Bypass -File scripts\utm\configurer-poste-windows.ps1 -Dev -DllMock C:\chemin\sgpv.dll
   ```

Le script vérifie le lecteur (PC/SC), démarre le service `SCardSvr`, installe
la FSV (ou le mock), et crée les variables `MAGICMED_DOCS_DIR` /
`MAGICMED_SGPV_PATH`.

## Mock sgpv.dll (développement)

```bash
cd apps/desktop/src-tauri/mocks/sgpv-mock
cargo build --release
# cible : target/release/sgpv.dll (sous Windows)
```

Copier `sgpv.dll` à côté de l'exécutable MagicMed ou dans
`C:\Program Files\MagicMed`. Le mock renvoie une identité de démonstration
(DUPONT Jean-Marie) et un CPS (DR MARTIN).

## Production

- Contrat GIE SESAM-Vitale obligatoire, FSV installée officiellement,
  lecteur certifié.
- La DLL réelle `sgpv.dll` et le flux B2/CPS complet ne sont jamais mockés en
  production : le code détecte l'absence de DLL et remonte une erreur claire.
- Données de santé : poste chiffré (BitLocker), accès restreint, RGPD.
