Describe 'install.sh test'
  Include ./install.sh

  Context 'filtering path'
	It 'filtering path'
	  When call filtering_path  
	  The stdout should not include "./.git" 
	End
  End

  Context 'process_env_is'
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
