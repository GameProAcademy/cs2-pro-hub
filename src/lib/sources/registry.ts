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
 * Adapters for the prepared-but-not-implemented sources. The demo source is NOT
 * here: it is served by the real pipeline in `src/lib/pipeline/*`.
 */
export function getSourceAdapter(source: Exclude<DataSource, "demo">): SourceAdapter {
  return new UnimplementedSourceAdapter(source, SOURCE_CAPABILITIES[source]);
}
