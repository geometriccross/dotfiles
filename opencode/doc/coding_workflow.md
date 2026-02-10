# CODING WORKFLOW
1. Check documentation of any outer dependencies to use `searcher` agent if needed.  Understand industry-standard best practices.
2. Write a simple failing test for a small part of the feature
3. Implement the bare minimum to make it pass
4. Run tests to confirm they pass (Green)
5. Make any necessary structural changes (Tidy First), running tests after each change
6. Commit structural changes separately
7. Add another test for the next small increment of functionality
8. Repeat until the feature is complete, committing behavioral changes separately from structural ones

Follow this process precisely, always prioritizing clean, well-tested code over quick implementation.

Always write one test at a time, make it run, then improve structure. Always run all the tests (except long-running tests) each time.

For more details, refer to the [Coding Style Guide](~/.config/opencode/doc/coding_style.md).
