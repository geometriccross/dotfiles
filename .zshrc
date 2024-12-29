# ==================== zsh setup ====================
function set_theme() {
	# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
	# Initialization code that may require console input (password prompts, [y/n]
	# confirmations, etc.) must go above this block; everything else may go below.
	if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
		source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
	fi
   
	ZSH_THEME="powerlevel10k/powerlevel10k"
	[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh 

	# setup oh-my-zsh
	# this segment need to run after setup of powerlevel10k
	export ZSH="$HOME/.oh-my-zsh"
	plugins=(git)
	source $ZSH/oh-my-zsh.sh
}

# Please refer this issue. https://github.com/microsoft/WSL/discussions/9245
function keep_alive_wsl() {
	# check current shell is running in WSL
	if grep -i "WSL" "/proc/version" >/dev/null; then
		# check dbus-daemon is running
		if ! ps x -u $(whoami) | grep '.bus-daemon' > /dev/null; then
			dbus-launch true
		fi  
	fi
}

# !! Contents within this block are managed by 'conda init' !!
function setup_conda() {
	local miniconda_path="$HOME/.miniconda"
	if [ $? -eq 0 ]; then
		"${miniconda_path}" shell.zsh hook shell.zsh 2> /dev/null
	else
		if [ -f "${miniconda_path}""/etc/profile.d/conda.sh" ]; then
           . "${miniconda_path}""/etc/profile.d/conda.sh"
    	else
        	export PATH="${miniconda_path}""/bin":$PATH
		fi
	fi
}

function set_editor_var() {
	# Preferred editor for local and remote sessions
	if [[ -n $SSH_CONNECTION ]]; then
		export EDITOR='vim'
	else
		export EDITOR='nvim'
	fi
}

export LANG=en_US.UTF-8

set_theme
keep_alive_wsl
setup_conda
set_editor_var

# ==================== alias ====================
alias v="nvim"
alias vi="nvim"
alias vim="nvim"
