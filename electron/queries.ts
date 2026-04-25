// SCM queries for different languages to extract entities, imports, variables, calls, and comments

export const languageQueries: Record<string, string> = {
  javascript: `
    ; Imports
    (import_statement source: (string (string_fragment) @import_path))
    (import_specifier name: (identifier) @import_entity)
    (import_clause (identifier) @import_entity)

    ; Classes
    (class_declaration name: (identifier) @class)
    
    ; Functions
    (function_declaration name: (identifier) @function)
    (method_definition name: (property_identifier) @function)
    (variable_declarator name: (identifier) @function value: (arrow_function))
    (variable_declarator name: (identifier) @function value: (function_expression))

    ; Local Variables
    (lexical_declaration (variable_declarator name: (identifier) @variable))
    (variable_declaration (variable_declarator name: (identifier) @variable))

    ; External Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (member_expression property: (property_identifier) @call))

    ; Comments
    (comment) @comment
  `,
  typescript: `
    ; Imports
    (import_statement source: (string (string_fragment) @import_path))
    (import_specifier name: (identifier) @import_entity)
    (import_clause (identifier) @import_entity)

    ; Classes
    (class_declaration name: (type_identifier) @class)
    
    ; Functions
    (function_declaration name: (identifier) @function)
    (method_definition name: (property_identifier) @function)
    (variable_declarator name: (identifier) @function value: (arrow_function))
    (variable_declarator name: (identifier) @function value: (function_expression))

    ; Local Variables
    (lexical_declaration (variable_declarator name: (identifier) @variable))
    (variable_declaration (variable_declarator name: (identifier) @variable))

    ; External Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (member_expression property: (property_identifier) @call))

    ; Comments
    (comment) @comment
  `,
  tsx: `
    ; Imports
    (import_statement source: (string (string_fragment) @import_path))
    (import_specifier name: (identifier) @import_entity)
    (import_clause (identifier) @import_entity)

    ; Classes
    (class_declaration name: (type_identifier) @class)
    
    ; Functions
    (function_declaration name: (identifier) @function)
    (method_definition name: (property_identifier) @function)
    (variable_declarator name: (identifier) @function value: (arrow_function))
    (variable_declarator name: (identifier) @function value: (function_expression))

    ; Local Variables
    (lexical_declaration (variable_declarator name: (identifier) @variable))
    (variable_declaration (variable_declarator name: (identifier) @variable))

    ; External Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (member_expression property: (property_identifier) @call))

    ; Comments
    (comment) @comment
  `,
  python: `
    ; Imports
    (import_statement name: (dotted_name) @import_path)
    (import_from_statement module_name: (dotted_name) @import_path name: (dotted_name) @import_entity)
    (import_from_statement module_name: (relative_import) @import_path name: (dotted_name) @import_entity)

    ; Classes
    (class_definition name: (identifier) @class)

    ; Functions
    (function_definition name: (identifier) @function)

    ; Local Variables
    (assignment left: (identifier) @variable)

    ; External Calls
    (call function: (identifier) @call)
    (call function: (attribute attribute: (identifier) @call))

    ; Comments
    (comment) @comment
    (expression_statement (string) @comment) ; docstrings
  `,
  go: `
    ; Imports
    (import_spec path: (interpreted_string_literal) @import_path)
    (import_spec name: (package_identifier) @import_entity path: (interpreted_string_literal))

    ; Classes (Structs in Go)
    (type_spec name: (type_identifier) @class type: (struct_type))

    ; Functions
    (function_declaration name: (identifier) @function)
    (method_declaration name: (field_identifier) @function)

    ; Local Variables
    (short_var_declaration left: (expression_list (identifier) @variable))
    (var_spec name: (identifier) @variable)

    ; External Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (selector_expression field: (field_identifier) @call))

    ; Comments
    (comment) @comment
  `,
  rust: `
    ; Imports
    (use_declaration argument: (scoped_identifier path: (identifier) @import_path name: (identifier) @import_entity))
    (use_declaration argument: (identifier) @import_path)

    ; Classes (Structs/Enums in Rust)
    (struct_item name: (type_identifier) @class)
    (enum_item name: (type_identifier) @class)

    ; Functions
    (function_item name: (identifier) @function)

    ; Local Variables
    (let_declaration pattern: (identifier) @variable)

    ; External Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (field_expression field: (field_identifier) @call))

    ; Comments
    (line_comment) @comment
    (block_comment) @comment
  `,
  java: `
    ; Imports
    (import_declaration
      (scoped_identifier) @import_path)

    ; Classes / Interfaces / Enums
    (class_declaration name: (identifier) @class)
    (interface_declaration name: (identifier) @class)
    (enum_declaration name: (identifier) @class)
    (record_declaration name: (identifier) @class)

    ; Functions / Methods / Constructors
    (method_declaration name: (identifier) @function)
    (constructor_declaration name: (identifier) @function)

    ; Local Variables
    (local_variable_declaration
      declarator: (variable_declarator name: (identifier) @variable))

    ; Calls
    (method_invocation name: (identifier) @call)

    ; Comments
    (line_comment) @comment
    (block_comment) @comment
  `,
  cpp: `
    ; Includes
    (preproc_include path: (string_literal) @import_path)
    (preproc_include path: (system_lib_string) @import_path)

    ; Classes / Structs
    (class_specifier name: (type_identifier) @class)
    (struct_specifier name: (type_identifier) @class)

    ; Functions
    (function_definition declarator: (function_declarator declarator: (identifier) @function))
    (function_definition declarator: (function_declarator declarator: (field_identifier) @function))

    ; Variables
    (declaration declarator: (init_declarator declarator: (identifier) @variable))

    ; Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (field_expression field: (field_identifier) @call))

    ; Comments
    (comment) @comment
  `,
  c_sharp: `
    ; Imports
    (using_directive name: (identifier) @import_path)
    (using_directive name: (qualified_name) @import_path)

    ; Classes / Interfaces / Enums / Structs / Records
    (class_declaration name: (identifier) @class)
    (interface_declaration name: (identifier) @class)
    (enum_declaration name: (identifier) @class)
    (struct_declaration name: (identifier) @class)
    (record_declaration name: (identifier) @class)

    ; Methods / Constructors / Local Functions
    (method_declaration name: (identifier) @function)
    (constructor_declaration name: (identifier) @function)
    (local_function_statement name: (identifier) @function)

    ; Variables
    (variable_declaration (variable_declarator name: (identifier) @variable))

    ; Calls
    (invocation_expression function: (identifier) @call)
    (invocation_expression function: (member_access_expression name: (identifier) @call))

    ; Comments
    (comment) @comment
  `,
  php: `
    ; Imports
    (namespace_use_declaration
      (namespace_use_clause
        name: (qualified_name) @import_path))

    ; Classes / Interfaces / Traits / Enums
    (class_declaration name: (name) @class)
    (interface_declaration name: (name) @class)
    (trait_declaration name: (name) @class)
    (enum_declaration name: (name) @class)

    ; Functions / Methods
    (function_definition name: (name) @function)
    (method_declaration name: (name) @function)

    ; Variables
    (simple_variable name: (variable_name) @variable)

    ; Calls
    (function_call_expression function: (name) @call)
    (member_call_expression name: (name) @call)
    (scoped_call_expression name: (name) @call)

    ; Comments
    (comment) @comment
  `,
  ruby: `
    ; Imports
    (call
      method: (identifier) @import_entity
      arguments: (argument_list (string (string_content) @import_path)))
    (#match? @import_entity "^(require|require_relative)$")

    ; Classes / Modules
    (class name: (constant) @class)
    (module name: (constant) @class)

    ; Methods
    (method name: (identifier) @function)
    (singleton_method name: (identifier) @function)

    ; Variables
    (assignment left: (identifier) @variable)

    ; Calls
    (call method: (identifier) @call)

    ; Comments
    (comment) @comment
  `,
  zig: `
    ; Imports
    (variable_declaration
      (identifier) @import_entity
      (call_expression
        function: (identifier) @call
        arguments: (arguments (string (string_content) @import_path))))
    (#eq? @call "@import")

    ; Structs / Enums / Unions
    (container_declaration (identifier) @class)

    ; Functions
    (function_declaration name: (identifier) @function)

    ; Variables
    (variable_declaration (identifier) @variable)

    ; Calls
    (call_expression function: (identifier) @call)
    (call_expression function: (field_expression member: (identifier) @call))

    ; Comments
    (line_comment) @comment
    (doc_comment) @comment
  `,
  swift: `
    ; Imports
    (import_declaration (identifier) @import_path)

    ; Classes / Structs / Enums / Protocols / Actors
    (class_declaration name: (type_identifier) @class)
    (struct_declaration name: (type_identifier) @class)
    (enum_declaration name: (type_identifier) @class)
    (protocol_declaration name: (type_identifier) @class)
    (actor_declaration name: (type_identifier) @class)

    ; Functions / Initializers
    (function_declaration name: (simple_identifier) @function)
    (init_declaration @function)

    ; Variables
    (property_declaration (pattern (identifier) @variable))

    ; Calls
    (call_expression called_expression: (simple_identifier) @call)
    (call_expression called_expression: (navigation_expression suffix: (simple_identifier) @call))

    ; Comments
    (comment) @comment
  `,
  kotlin: `
    ; Imports
    (import_header identifier: (identifier) @import_path)
    (import_header identifier: (navigation_expression) @import_path)

    ; Classes / Interfaces / Enums / Objects
    (class_declaration name: (type_identifier) @class)
    (interface_declaration name: (type_identifier) @class)
    (enum_class_body) @class
    (object_declaration name: (identifier) @class)

    ; Functions
    (function_declaration name: (simple_identifier) @function)
    (secondary_constructor) @function

    ; Variables
    (property_declaration (variable_declaration name: (simple_identifier) @variable))

    ; Calls
    (call_expression (simple_identifier) @call)
    (call_expression (navigation_suffix (simple_identifier) @call))

    ; Comments
    (line_comment) @comment
    (multiline_comment) @comment
  `,
};
