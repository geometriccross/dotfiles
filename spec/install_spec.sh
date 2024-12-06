Include ./install.sh

Describe 'filtering_path test'
    It 'can filter path'
        When call filtering_path hoge
        The output should equal hoge 
    End

    It 'wrong param'
        When call filtering_path ".gitignore"
        The status should be failure
    End
End

Describe 'create_link test'
    It 'can create link'
        temp=$(mktemp -d)
        When call create_link ${temp} hoge
        The path ${temp}/hoge should be symlink
        rm -rf ${temp}
    End
End
