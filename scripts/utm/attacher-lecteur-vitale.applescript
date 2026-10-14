# Attache le lecteur de carte Vitale (USB) à la VM UTM "MagicMed-Windows".
# Usage : osascript scripts/utm/attacher-lecteur-vitale.applescript
on run
    tell application "UTM"
        set vms to virtual machines
        set targetVM to missing value
        repeat with vm in vms
            if name of vm is "MagicMed-Windows" then
                set targetVM to vm
                exit repeat
            end if
        end repeat
        if targetVM is missing value then error "VM MagicMed-Windows introuvable dans UTM."
        -- UTM 4.x : les périphériques USB ne sont exposés en AppleScript
        -- qu'à partir de certaines versions ; la sélection manuelle dans
        -- la barre latérale USB de la VM reste le chemin fiable.
        display dialog "Brancher le lecteur Vitale puis cocher l'appareil dans la barre USB de la VM MagicMed-Windows dans UTM."
    end tell
end run
