# Spec Delta

## Purpose

Ensures document viewing and editing follow the user's active role consistently in the interface and in any existing document API, while preserving read-only navigation and export.

## ADDED Requirements

### Requirement: Reader sessions are read-only
The system SHALL prevent an active `reader` from changing document content or structure, including fields, rows, columns, subsections, order, and technical-profile selections.

#### Scenario: Reader uses document controls
- **WHEN** a reader views any document section
- **THEN** editable fields and mutating controls cannot change the document

#### Scenario: Reader attempts a mutation beyond visible controls
- **WHEN** a reader invokes a document-changing action through another interface path
- **THEN** the action does not change the document

### Requirement: Reader retains non-mutating capabilities
The system SHALL allow a reader to navigate sections, select and copy displayed content, and export the current document, but MUST NOT allow the reader to create a new document or import content.

#### Scenario: Reader navigates and exports
- **WHEN** a reader navigates to a section or exports the document
- **THEN** the operation remains available and the document is unchanged

#### Scenario: Reader attempts new or import
- **WHEN** a reader attempts to create a new document or import a file
- **THEN** the system does not replace or alter the current document

### Requirement: Editing status reflects the current role
The system SHALL show `En edición` in Información del documento > Estado for an active `admin` or `editor`, and `Sólo lectura` for an active `reader` or legacy `reviewer`.

#### Scenario: Reader views document information
- **WHEN** a reader opens document information
- **THEN** Estado displays `Sólo lectura`

#### Scenario: Editor views document information
- **WHEN** an editor opens document information
- **THEN** Estado displays `En edición`

### Requirement: Document API rejects writes without an editing role
The system MUST reject document creation, update, deletion, and permission changes by a `reader` or `reviewer`, even when that user owns a document or has a legacy edit grant. Existing authorized read access SHALL remain available.

#### Scenario: Reader owns a document
- **WHEN** a reader calls the document API to update or delete a document they own
- **THEN** the write is rejected and the stored document is unchanged

#### Scenario: Reader has a legacy edit grant
- **WHEN** a reader with an existing edit grant calls the API to update a document or its permissions
- **THEN** the write is rejected and stored data is unchanged

#### Scenario: Authorized editor writes
- **WHEN** an active editor with ownership or an edit grant writes a document within their existing permissions
- **THEN** the existing authorization rules continue to allow the write

