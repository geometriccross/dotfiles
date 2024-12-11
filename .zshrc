export LANG=en_US.UTF-8

function set_theme() {
   if [[ ! -e $HOME/.oh-my-zsh ]]; then
      # install oh my zsh
      sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
   fi

   # Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
   # Initialization code that may require console input (password prompts, [y/n]
   # confirmations, etc.) must go above this block; everything else may go below.
   if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
     source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
   fi
   
   local theme_path=${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
   if [[ ! -e $theme_path ]]; then
      git clone --depth=1 https://github.com/romkatv/powerlevel10k.git $theme_path 
   fi

   ZSH_THEME="powerlevel10k/powerlevel10k"
   [[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh 

   # setup oh-my-zsh
   # this segment need to run after setup of powerlevel10k
   export ZSH="$HOME/.oh-my-zsh"
   plugins=(git)
   source $ZSH/oh-my-zsh.sh
}



# ---------- Utiity ---------- 
function keep_alive_wsl() {
   # Please refer this issue. https://github.com/microsoft/WSL/discussions/9245
   if ! ps x -u $(whoami) | grep '.bus-daemon' > /dev/null; then
      dbus-launch true
   fi  
}

# !! Contents within this block are managed by 'conda init' !!
function setup_conda() {
   local conda_setup="$('/home/geometriccross/.miniconda/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
   if [ $? -eq 0 ]; then
       eval "$conda_setup"
   else
       if [ -f "/home/geometriccross/.miniconda/etc/profile.d/conda.sh" ]; then
           . "/home/geometriccross/.miniconda/etc/profile.d/conda.sh"
       else
           export PATH="/home/geometriccross/.miniconda/bin:$PATH"
       fi
   fi
}


# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

set_theme
install_nvim & 
install_kickstart & 
keep_alive_wsl & 
setup_conda &

wait
