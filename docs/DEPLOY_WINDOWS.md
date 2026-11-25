# Running the shop server on the Windows PC

This guide is for the shop owner or whoever looks after the shop PC. You type the commands in **PowerShell**. Each one is a single line you can copy.

## What you get

- One Windows PC runs everything: the database, the sign-in server (Keycloak), the ERP, and automatic backups.
- Staff on the shop Wi-Fi open `https://<PC address>` in a browser (or the manager app).
- Nothing is reachable from the internet.
- Backups are written every 6 hours to a folder you choose, ideally on **a second disk or a USB drive**.

## 1. Prepare the PC (once)

1. **Give the PC a fixed address on the shop network.** In your Wi-Fi router, reserve an IP address for it (often called "DHCP reservation"), for example `192.168.1.50`. Staff devices will use this address.
2. **Install Docker Desktop for Windows** from docker.com. During setup, choose the **WSL 2** engine. After installing:
   - Docker Desktop → Settings → General → tick **Start Docker Desktop when you sign in to your computer**.
   - Settings → Resources: give it at least 4 CPUs and 6 GB of memory if the PC has them.
3. **Install Git for Windows** from git-scm.com, using the default options.
4. **Power and updates:**
   - Use a **UPS** (battery backup) for the PC.
   - Set Windows Update active hours to cover your opening times.
   - Set the PC never to sleep (Settings → System → Power).
5. **Windows sign-in:** Docker Desktop starts when a user signs in. The PC must therefore be signed in for the server to run. Use a dedicated Windows account for the shop server and lock the screen (Windows key + L) rather than signing out.

## 2. Install (once)

Open PowerShell, then run:

```powershell
cd C:\
git clone https://github.com/Abdallah-hanini/my_shope.git
cd my_shope
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy\windows\install.ps1 -SiteHost 192.168.1.50 -BackupDir D:\ERP-Backups
```

Replace `192.168.1.50` with the PC's reserved address and `D:\ERP-Backups` with your backup folder.

The first run takes several minutes, because it builds the software. When it finishes:

1. **Keep a copy of `C:\my_shope\deploy\.env` somewhere safe and offline**, for example a USB key in a drawer. It holds the passwords that protect your data. Without it, a backup cannot be restored on a new PC.
2. **Trust the shop certificate on this PC.** Open PowerShell **as Administrator** and run:
   `.\deploy\windows\export-ca.ps1 -Install`
3. **Trust it on each staff device.** Copy `deploy\erp-root-ca.crt` to the device and install it:
   - Windows: double-click the file, choose **Install Certificate**, then **Local Machine**, then **Trusted Root Certification Authorities**.
   - Android: Settings → Security → Encryption & credentials → Install a certificate → **CA certificate**.
   - iPhone/iPad: open the file to install the profile, then Settings → General → About → **Certificate Trust Settings** → turn it on.
4. **Create your administrator account:**

   ```powershell
   .\deploy\windows\add-admin.ps1 -Username owner -Email you@example.com -FirstName Your -LastName Name
   ```

   The script prints a **temporary password once**. Open `https://192.168.1.50` and sign in. You will be asked to choose a new password and to scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or similar). From then on, each sign-in needs your password and the 6-digit code.

## 3. Everyday commands

Run these from `C:\my_shope` in PowerShell.

| Task | Command |
|---|---|
| See whether everything is running, and the last backup time | `.\deploy\windows\status.ps1` |
| Take a backup now | `.\deploy\windows\backup-now.ps1` |
| Check that the newest backup can really be restored (live data is not touched) | `.\deploy\windows\verify-backup.ps1` |
| Stop / start the server | `.\deploy\windows\stop.ps1` / `.\deploy\windows\start.ps1` |
| Install a new version (it backs up first, and adds any new settings to `deploy\.env`) | `.\deploy\windows\upgrade.ps1` |

**Recommended routine:** run `verify-backup.ps1` once a week, and copy the backup folder to a second place (another USB drive or cloud storage you trust) once a week.

## 4. Restore from a backup

Backups are named by time in UTC, for example `erp-20261125T180000Z.dump` and `keycloak-20261125T180000Z.dump`. Restore both from the same time:

```powershell
.\deploy\windows\restore.ps1 -Stamp 20261125T180000Z
```

You must type `RESTORE` to confirm. The script then:
1. Takes a safety backup of the current data.
2. Stops the applications.
3. Restores both databases.
4. Starts the applications again.

Everything entered after that backup is lost.

**On a new PC:**
1. Install Docker and Git as in step 1.
2. Clone the repository.
3. Put your saved `.env` file back at `deploy\.env`, with `ERP_BACKUP_DIR` pointing at a folder that contains the backups.
4. Run `install.ps1`, then `restore.ps1`.

## 5. If something is wrong

- **`status.ps1` shows a service as unhealthy:** run `.\deploy\windows\stop.ps1`, then `.\deploy\windows\start.ps1`. If it stays unhealthy, save the output of `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs --tail 200` and send it to whoever supports the system.
- **`status.ps1` says BACKUP FAILURE:** check that the backup disk is connected and has space, then run `backup-now.ps1`. The failure message clears after the next successful backup.
- **The browser says the connection is not private:** the device does not trust the shop certificate yet (step 2.3), or the address typed is different from `-SiteHost`.
- **Sign-in administration** (resetting a staff password, unlocking an account after too many attempts): open `https://<PC address>/auth/admin` on the shop PC. Use the user `kcadmin` with `KC_BOOTSTRAP_ADMIN_PASSWORD` from `deploy\.env`, then switch to the **erp** realm. Keycloak shows a banner because this is a temporary admin account. Create a permanent administrator in the **master** realm and then delete `kcadmin`.

## What is not done yet

- Web screens available now: companies, branches, chart of accounts, fiscal periods, journals (entry, list, detail, reversal) and the audit trail. Adding staff users and roles from the web is the next step; until then, use `add-admin.ps1` for administrators.
- Customer-facing access from the internet is postponed (owner decision). Do not forward router ports to this PC.
