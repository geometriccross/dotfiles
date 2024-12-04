function set_theme () {
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
}

function install_nvim () {
   if ! nvim -v > /dev/null; then
      echo Neovim is not installed.
      echo start install...
      
      # Refer this https://github.com/geometriccross/kickstart.nvim
      sudo bash -c "add-apt-repository ppa:neovim-ppa/unstable -y \
         && sudo apt update && sudo apt install make gcc ripgrep unzip git xclip neovim"
   fi
}

function install_kickstart () {
   local path="${HOME}/.config/nvim"
   if [[ ! -e $path ]]; then
      echo kickstart.vim is not installed.
      echo Start install kickstart.nvim
      git clone git@github.com:geometriccross/kickstart.nvim.git $path
   fi 
}

function keep_alive_wsl () {
   # Please refer this issue. https://github.com/microsoft/WSL/discussions/9245
   if ! ps x -u $(whoami) | grep '.bus-daemon' > /dev/null; then
      dbus-launch true
   fi  
}

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

export ZSH="$HOME/.oh-my-zsh"
plugins=(git)
source $ZSH/oh-my-zsh.sh

set_theme
install_nvim 
install_kickstart 
keep_alive_wsl 

export LANG=en_US.UTF-8

