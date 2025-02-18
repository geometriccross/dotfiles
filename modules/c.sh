#!/bin/bash

# conda setup
if [ -z "${CONDA_DEFAULT_ENV}" ]; then
	conda activate
else
	conda deactivate
fi

# OPTIONAL
# local conda_setup=eval "$(${HOME}'/.miniconda3/bin/conda' 'shell.zsh' 'hook' 2>/dev/null)"
# if [ $? -eq 0 ]; then
# 	eval "$conda_setup"
# else
# 	if [ -f "${HOME}/.miniconda3/etc/profile.d/conda.sh" ]; then
# 		. "${HOME}/.miniconda3/etc/profile.d/conda.sh"
# 	else
# 		export PATH="${HOME}/.miniconda3/bin:$PATH"
# 	fi
# fi
