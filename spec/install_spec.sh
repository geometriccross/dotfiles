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

Describe 'run_with_prompt test'
	Context 'when call run_with_prompt'
		It 'can return correct prompt'
			APP_NAME=test_app
			When call run_with_prompt ${APP_NAME} echo ${APP_NAME} installing...
			The stdout should include "success"
		End

		It 'can return prompt if install failed'
			APP_NAME=incorrect_app
			When call run_with_prompt ${APP_NAME} ${APP_NAME}
			The stderr should match pattern "*${APP_NAME}: not found"
			The stdout should include "failed"
		End
	End
End
