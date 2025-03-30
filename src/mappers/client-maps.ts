import { ConnectedClient } from '../client.js';

/**
 * Maps to track which client owns which resource
 */
export class ClientMaps {
  private toolToClientMap = new Map<string, ConnectedClient>();
  private resourceToClientMap = new Map<string, ConnectedClient>();
  private promptToClientMap = new Map<string, ConnectedClient>();

  /**
   * Gets the client associated with a specific tool
   */
  getClientForTool(name: string): ConnectedClient | undefined {
    return this.toolToClientMap.get(name);
  }

  /**
   * Gets the client associated with a specific resource
   */
  getClientForResource(uri: string): ConnectedClient | undefined {
    return this.resourceToClientMap.get(uri);
  }

  /**
   * Gets the client associated with a specific prompt
   */
  getClientForPrompt(name: string): ConnectedClient | undefined {
    return this.promptToClientMap.get(name);
  }

  /**
   * Maps a tool to a client
   */
  mapToolToClient(toolName: string, client: ConnectedClient): void {
    this.toolToClientMap.set(toolName, client);
  }

  /**
   * Maps a resource to a client
   */
  mapResourceToClient(resourceUri: string, client: ConnectedClient): void {
    this.resourceToClientMap.set(resourceUri, client);
  }

  /**
   * Maps a prompt to a client
   */
  mapPromptToClient(promptName: string, client: ConnectedClient): void {
    this.promptToClientMap.set(promptName, client);
  }

  /**
   * Clears the tool to client map
   */
  clearToolMap(): void {
    this.toolToClientMap.clear();
  }

  /**
   * Clears the resource to client map
   */
  clearResourceMap(): void {
    this.resourceToClientMap.clear();
  }

  /**
   * Clears the prompt to client map
   */
  clearPromptMap(): void {
    this.promptToClientMap.clear();
  }
}

// Singleton instance for use across the application
export const clientMaps = new ClientMaps();
