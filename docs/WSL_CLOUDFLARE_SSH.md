# SSH Into WSL Linux Through Cloudflare

Yes, this is possible, and if you set it up this way you will land directly in the **Linux WSL environment**, not in Windows.

The basic idea is:

1. run `sshd` inside your WSL distro
2. run `cloudflared` inside that same WSL distro
3. expose `localhost:22` from Linux through a Cloudflare Tunnel
4. SSH through Cloudflare Access to the Linux sshd

## What you need

- a domain on Cloudflare
- a Cloudflare Zero Trust account
- WSL with Ubuntu installed
- this repo cloned inside WSL

## 1. Set up `sshd` inside WSL

Inside WSL:

```bash
cd ~/thesis
./scripts/wsl/setup_wsl_ssh.sh
```

That script:

- installs `openssh-server`
- enables `systemd` in `/etc/wsl.conf`
- writes a small hardened `sshd` config include
- starts and enables the `ssh` service

If the script tells you to restart WSL, do this from Windows PowerShell:

```powershell
wsl --shutdown
```

Then reopen Ubuntu and verify:

```bash
sudo systemctl status ssh --no-pager
ss -tlnp | grep ':22'
```

## 2. Make sure your Linux user has SSH keys

On the client machine you’ll connect **from**, generate a key if you do not already have one:

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Copy the public key into WSL:

```bash
cat ~/.ssh/id_ed25519.pub
```

Append that line inside WSL to:

```text
~/.ssh/authorized_keys
```

## 3. Install `cloudflared` inside WSL

Inside WSL, follow Cloudflare’s Debian/Ubuntu install instructions.

At the time of writing, the usual flow is:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update
sudo apt-get install -y cloudflared
```

## 4. Create the tunnel

Inside WSL:

```bash
sudo cloudflared tunnel login
sudo cloudflared tunnel create thesis-wsl
```

Then route a DNS name to it:

```bash
sudo cloudflared tunnel route dns thesis-wsl ssh.your-domain.example
```

## 5. Install the tunnel config in WSL

Copy the template from this repo:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ./scripts/wsl/cloudflared-config.example.yml /etc/cloudflared/config.yml
```

Edit it:

```bash
sudo nano /etc/cloudflared/config.yml
```

Replace:

- `YOUR_TUNNEL_ID`
- `ssh.your-domain.example`

The service should stay:

```yaml
service: ssh://localhost:22
```

That is what makes the connection terminate inside the WSL Linux sshd.

## 6. Run the tunnel as a service

Inside WSL:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

## 7. Protect it with Cloudflare Access

In Cloudflare Zero Trust:

1. create an **Access application**
2. choose **Self-hosted**
3. set the domain to `ssh.your-domain.example`
4. add your identity policy so only you can reach it

## 8. SSH from a client machine

### Option A: direct `ssh` command

Install `cloudflared` on the client machine too, then use:

```bash
cloudflared access ssh --hostname ssh.your-domain.example
```

### Option B: standard SSH config

On the client machine, add this to `~/.ssh/config`:

```sshconfig
Host thesis-wsl
  HostName ssh.your-domain.example
  User your-linux-username
  ProxyCommand cloudflared access ssh --hostname %h
```

Then connect with:

```bash
ssh thesis-wsl
```

## Why this lands in Linux and not Windows

Because both of these services are running **inside WSL**:

- `sshd`
- `cloudflared`

So Cloudflare is forwarding directly to the Linux `localhost:22`, not to Windows OpenSSH.

## Recommended sanity checks

Inside WSL:

```bash
whoami
uname -a
pwd
systemctl status ssh --no-pager
systemctl status cloudflared --no-pager
```

From the remote client after SSH login:

```bash
whoami
hostname
uname -a
```

You should see the Linux distro user and environment, not a Windows shell.
