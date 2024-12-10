Describe 'install.sh test'
  Include ./install.sh

  Context 'filtering path'
	It 'filtering path'
	  When call filtering_path  
	  The stdout should not include "./.git" 
	End
  End
End
