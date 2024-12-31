Include ./install.sh -d

Describe 'filtering_path test'
	Context 'when call filtering_path'
		It 'filtering path'
			When call filtering_path
			The stdout should not include "./.git"
		End
	End
End

Describe 'process_env_is test'
	Context 'when call process_env_is'
		It 'can return wsl'
			When call process_env_is
			The stdout should equal "wsl"
		End

		It 'can return container'
			When call docker run --rm -v "$(pwd)/install.sh:/install.sh" alpine sh -c ". install.sh -d; process_env_is"
			The stdout should equal "container"
		End
	End
End
