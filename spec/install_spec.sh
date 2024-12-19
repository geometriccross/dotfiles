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

Describe 'sand_with_bar test'
	It 'would return correct str'
		When call sand_with_bar hoge
		The stdout should match pattern "*=============== hoge ===============*"
	End
End

Describe 'check_cmd_with_prompt test'
	Context 'when call function'
		It 'if command is not exist'
			target="incorrect_cmd"
			check_cmd="hoge"
			When call check_cmd_with_prompt "${target}" "${check_cmd}"
			The stderr should include "not installed"
		End

		It 'if command is exist'
			target="test"
			check_cmd="echo"
			When call check_cmd_with_prompt test echo
			The stdout should include "already installed"
		End

		It 'when call with here document'
			When call check_cmd_with_prompt test "$(cat <<- EOF
				echo A
			EOF
			)"

			The stdout should include "already installed"
		End
	End
End

Describe 'install_with_prompt test'
	Context 'when call install_with_prompt'
		It 'can return correct prompt'
			When call install_with_prompt test_app echo test_app installing...
			The stdout should include "success"
		End

		It 'can return prompt if install failed'
			When call install_with_prompt incorrect_app hoge
			The stdout should include incorrect_app
			The stderr should include "failed"
		End

		It 'when call with here document, can success'
			When call install_with_prompt test "$(cat <<- EOF
				echo here document test
			EOF
			)"

			The stdout should include "success"
		End
	End
End
