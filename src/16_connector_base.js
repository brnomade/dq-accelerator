// ===============================================================================
// CLOUD DATABASE CONNECTOR BASE -- registry and interface contract
//
// Defines the registry that every cloud database connector registers itself
// into, plus the shared type contracts the generic UI renders and calls against.
//
// Dependencies: NONE. This file is numbered 16 because it must be evaluated
// before any connector file, whose registration line runs at load time.
//
// Consumers: 47_connector_athena.js (registers itself),
//            217_screen_db_settings.js, 210_screen_import.js, 230_screen_export.js
// ===============================================================================

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// Keyed by connector id. Each connector file appends itself at load time:
//
//   ConnectorRegistry['athena'] = AthenaConnector;
//
// The UI never names a connector directly -- the Database Settings selector
// reads Object.keys(ConnectorRegistry), and every screen calls the interface
// methods below. Adding a future connector (Synapse, BigQuery) therefore needs
// a new source file and one registration line, with no UI changes.
const ConnectorRegistry = {};

// ---------------------------------------------------------------------------
// Type contracts
// ---------------------------------------------------------------------------
//
// FieldDef -- one row of the dynamic config form rendered by the Database
// Settings screen. Returned as an array from getConfigSchema().
//
//   {
//     key:          string,               // config object property name
//     label:        string,               // form label shown to the user
//     type:         'text' | 'password',  // 'password' renders masked
//     required:     bool,                 // blocks Test Connection when empty
//     placeholder?: string,               // example value, e.g. 'eu-west-2'
//   }
//
// StepResult -- one entry in the progress log returned by setupDatabase().
//
//   {
//     step:    number,   // 1-based step index
//     ok:      bool,     // did this step succeed
//     message: string,   // human-readable description of the step
//     error?:  string,   // failure detail; present only when ok is false
//   }
//
// onProgress -- callback passed to every long-running connector method. Called
// once per completed step so the UI can drive a progress bar.
//
//   onProgress(step: number, total: number, message: string): void
//
// ---------------------------------------------------------------------------
// Connector interface
// ---------------------------------------------------------------------------
//
// Every connector object implements exactly this shape:
//
//   {
//     id:    string,   // registry key, e.g. 'athena'
//     label: string,   // display name, e.g. 'AWS Athena'
//
//     // Field definitions for the dynamic settings form.
//     getConfigSchema(): FieldDef[],
//
//     // Validate credentials and connectivity. Must not modify any state.
//     testConnection(config): Promise<{ ok: bool, error?: string }>,
//
//     // Idempotent DDL: create the database and all SCHEMA tables if absent.
//     setupDatabase(config, onProgress): Promise<StepResult[]>,
//
//     // Pull the connector's table set; return app-shaped data keyed by table
//     // name. Attempts every table even after one fails, so a single run
//     // reports every problem. ok is false if any table failed, and data is
//     // then partial -- callers must apply nothing unless ok is true. data may
//     // legitimately omit SCHEMA tables the connector does not hold; those are
//     // named in warnings, so callers must merge rather than assign.
//     importAllTables(config, onProgress):
//         Promise<{ ok: bool, data: object, warnings: string[], failedTables: string[] }>,
//
//     // Push every SCHEMA table using the connector's own write strategy.
//     // Athena and Synapse use DROP + CREATE; BigQuery may upsert instead.
//     exportAllTables(config, data, onProgress): Promise<{ ok: bool, failedTables: string[] }>,
//   }
//
