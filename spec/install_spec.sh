Describe 'install.sh function test'
    Include ./install.sh
    
    It 'check filtering_path can filter path'
        When call filtering_path hoge
        The output should equal hoge 
    End
End
