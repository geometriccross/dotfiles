#!/bin/bash

# conda setup
if [ -z "${CONDA_DEFAULT_ENV}" ]; then
	micromamba activate
else
	micromamba deactivate
fi
