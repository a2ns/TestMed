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

## VM Windows « Core » (WinPE, UTM)

La VM cible est une image **WinPE** (Windows Preinstallation Environment) : un
Windows minimaliste sans installation, dédié au lecteur de carte Vitale et à
la DLL FSV.

1. Sur un hôte Windows avec **Windows ADK + WinPE add-on**, générer l'ISO :

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\winpe\build-winpe.ps1 -Arch amd64 -SgpvDll C:\chemin\sgpv.dll
   # -SgpvDll : DLL FSV réelle (production) ou mock sgpv-mock (dev)
   # Driver du lecteur : déposer le .inf/.sys dans scripts\winpe\driver-lecteur\
   ```

   L'image embarque : support PC/SC (SCardSvr, WinSCard), PowerShell, réseau,
   la DLL `sgpv.dll` dans `X:\MagicMed\`, et un `startnet.cmd` qui lance la
   configuration automatiquement au boot.

2. Créer la VM UTM : `scripts/winpe/creer-vm-winpe-utm.sh winpe-magicmed.iso`
   — VM *Emulate*, x86_64 (ou ARM64), 2 vCPU / 2 Go, pas de disque (WinPE vit
   en RAM), ISO en disque de démarrage.

3. Démarrer la VM, brancher le lecteur Vitale, le cocher dans la barre USB
   d'UTM. La configuration (`configurer-poste-winpe.ps1`) s'exécute au boot.

4. Test manuel dans le shell WinPE :

   ```powershell
   powershell -File X:\MagicMed\test-lecteur.ps1
   ```

### Alternative VM Windows complète

Un script de création de VM Windows 11 ARM64 complète reste disponible :
`scripts/utm/creer-vm-windows.sh`, avec configuration du poste via
`scripts/utm/configurer-poste-windows.ps1` (installeur FSV ou mock, variables
d'env MagicMed).

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
