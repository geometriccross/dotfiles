#!/usr/bin/env zsh

function peco-projects () {
  local selected_dir=$(ls -1 ~/projects | peco --query "$LBUFFER")
  if [ -n "$selected_dir" ]; then
    BUFFER="cd ~/projects/${selected_dir}"
    zle accept-line
  fi
  zle clear-screen
}

zle -N peco-projects
bindkey '^]' peco-projects
