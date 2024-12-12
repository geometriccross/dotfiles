Include ./install.sh

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
			When call docker run --rm -v "$(pwd)/install.sh:/install.sh" alpine sh -c ". install.sh; process_env_is"
			The stdout should equal "container"
		End
	End
End

Describe 'run_with_prompt test'
	Context 'when call run_with_prompt'
		It 'can return correct prompt'
			When call run_with_prompt test_app echo test_app installing...
			The stdout should equal "$(cat <<- EOF
				test_app is not installed.
				Start install test_app.
				test_app installing...
				Install test_app success!
			EOF
			)"
		End
	End
End
