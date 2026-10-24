import {
  createRelationship,
  resolveSymbolEndpoint,
  type FileContentEntry,
  type StackRelationshipType,
  type StackStructuralRelationship,
} from './stackTopologySupport';
import { AdapterSources } from './stackTopologySources';

interface ContractBindingSpec {
  /** The contract files (specs, schemas) whose names are looked up. */
  contracts: FileContentEntry[];
  /** The generated or runtime files that may implement the contract. */
  implementations: FileContentEntry[];
  /** Names a contract file defines (operation ids, service names, its own stem). */
  namesOf: (contract: FileContentEntry) => string[];
  /**
   * Null when the implementation does not bind the name; otherwise the symbols of the
   * implementation to prefer as the link target.
   */
  bind: (
    implementation: FileContentEntry,
    name: string,
    contract: FileContentEntry
  ) => string[] | null;
  type: StackRelationshipType;
  /** Reason of the link to the implementation file, when the file itself is linked. */
  fileReason?: string;
  /** Reason of the link to the bound symbol, when the symbol is linked. */
  symbolReason?: string;
}

/**
 * A contract file links to the implementation files that bind a name it defines: to the file
 * (`fileReason`) and to the symbol inside it (`symbolReason`).
 */
export const contractBindingLinks = (
  sources: AdapterSources,
  spec: ContractBindingSpec
): StackStructuralRelationship[] =>
  spec.contracts.flatMap((contract) => {
    const names = spec.namesOf(contract);
    return spec.implementations.flatMap((implementation) =>
      names.flatMap((name) => {
        const preferredSymbols = spec.bind(implementation, name, contract);
        if (!preferredSymbols) return [];
        const links: StackStructuralRelationship[] = [];
        if (spec.fileReason) {
          links.push(
            createRelationship(
              contract.filePath,
              implementation.filePath,
              spec.type,
              spec.fileReason
            )
          );
        }
        if (spec.symbolReason) {
          const endpoint = resolveSymbolEndpoint(
            implementation.filePath,
            sources.graphSymbolIndex,
            { preferredSymbols }
          );
          links.push(createRelationship(contract.filePath, endpoint, spec.type, spec.symbolReason));
        }
        return links;
      })
    );
  });
