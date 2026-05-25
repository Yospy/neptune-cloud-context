alter table public.contexts
  drop constraint if exists contexts_context_type_check;

alter table public.contexts
  add constraint contexts_context_type_check
  check (
    context_type in (
      'api_contract',
      'ui_contract',
      'implementation_note',
      'decision',
      'migration',
      'bug_context',
      'setup_note',
      'requirement',
      'general_context',
      'project_index'
    )
  );
