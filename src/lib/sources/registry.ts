/**
 * Source registry. Single place where the app asks "what can each source do
 * today?" — used by the UI to render honest states instead of fake buttons.
 */
import { SOURCE_CAPABILITIES } from "./capabilities";
import { UnimplementedSourceAdapter, type SourceAdapter } from "./adapter";
import {
  CONNECTABLE_SOURCES,
  SOURCE_CONNECTION_TYPES,
  SOURCE_PRIORITY,
  SOURCE_QUALITY,
  isSourceImplemented,
  type ConnectionType,
  type DataSource,
} from "./sources";

export interface SourceDescriptor {
  source: DataSource;
  implemented: boolean;
  connectable: boolean;
  connectionTypes: ConnectionType[];
  quality: (typeof SOURCE_QUALITY)[DataSource];
  priority: number;
}

export function describeSource(source: DataSource): SourceDescriptor {
  const connectable = (CONNECTABLE_SOURCES as readonly DataSource[]).includes(source);
  return {
    source,
    implemented: isSourceImplemented(source),
    connectable,
    connectionTypes: connectable
      ? (SOURCE_CONNECTION_TYPES[source as Exclude<DataSource, "demo">] ?? [])
      : [],
    quality: SOURCE_QUALITY[source],
    priority: SOURCE_PRIORITY[source],
  };
}

/**
 * Adapters for the prepared-but-not-implemented sources. `demo` is NOT here
 * (served by `src/lib/pipeline/*`) and neither is `faceit` (served by
 * `src/lib/faceit/*`) — returning an "unimplemented" adapter for either would
 * misrepresent a working integration.
 */
export function getSourceAdapter(source: Exclude<DataSource, "demo" | "faceit">): SourceAdapter {
  return new UnimplementedSourceAdapter(source, SOURCE_CAPABILITIES[source]);
}

