# Global Usage (Run from Any Directory)


If you want to run `autoabm` directly from any project directory, set up one of the following. Once configured, `autoabm` will automatically recognize your current working directory.

## macOS / Linux

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Option 1: Add to PATH (recommended)
export PATH="$HOME/path/to/autoabm/bin:$PATH"

# Option 2: Alias
alias autoabm="$HOME/path/to/autoabm/bin/autoabm"
```

Then reload the config:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Windows (Git Bash)

Add to `~/.bashrc`:

```bash
export PATH="$HOME/path/to/autoabm/bin:$PATH"
```

### Windows + WSL Toolchains

If `autoabm` runs on Windows / Git Bash but tools such as Node, Python, uv, or bun are installed inside WSL, call them through WSL explicitly:

```bash
wsl -e bash -lc 'node --version && python3 --version'
```

When autoabm detects `wsl` / `wsl.exe`, it automatically sets `MSYS2_ARG_CONV_EXCL=*` so Git Bash does not rewrite WSL paths such as `/home/...` into `C:/Program Files/Git/home/...`.

To route Bash tool commands through WSL by default, set this before startup:

```bash
export CLAUDE_CODE_SHELL_PREFIX='wsl -e bash -lc'
```

Computer Use still controls Windows desktop apps. CLI tools running inside WSL do not need to be added to `computer-use-config.json`. If you only need the WSL toolchain and do not need desktop control, disable Computer Use with `--no-computer-use` or the Settings > Computer Use switch.

## Verify

After setup, navigate to any project directory and test:

```bash
cd ~/your-other-project
autoabm
# Ask "What is the current directory?" — it should show ~/your-other-project
```
