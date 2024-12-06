Describe 'install.sh function test'
    Include ./install.sh
    
    It 'check filtering_path can filter path'
        When call filtering_path hoge
        The output should equal hoge 
    End

    It 'create link'
        temp=$(mktemp -d)
        When call create_link ${temp} hoge
        The path ${temp}/hoge should be symlink
        rm -rf ${temp}
    End
End
