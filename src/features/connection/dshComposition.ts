import { Context } from '@deepseek-ai/cordis';
import * as gatewayClient from '@deepseek-ai/dsh-api-gateway/client';
import sessionRemote from '@deepseek-ai/dsh-api-session-controller/remote';
import * as sessionControllerClient from '@deepseek-ai/dsh-api-session-controller/client';
import workspaceRemote from '@deepseek-ai/dsh-api-workspace-controller/remote';
import * as workspaceControllerClient from '@deepseek-ai/dsh-api-workspace-controller/client';
import {
  installConnection,
  type ClientTransportHooks,
  type ConnectionLocation,
} from '@deepseek-ai/dsh-client-connection/client';
import fileUploadRemote from '@deepseek-ai/dsh-client-file-upload/remote';
import * as fileUploadClient from '@deepseek-ai/dsh-client-file-upload/client';
import commandsRemote from '@deepseek-ai/dsh-commands/remote';
import subagentsRemote from '@deepseek-ai/dsh-subagent/remote';
import * as typertRegistryClient from '@deepseek-ai/dsh-typert-registry/client';

export interface DshCompositionOptions {
  transport: ClientTransportHooks;
  location?: ConnectionLocation;
}

export interface DshComposition {
  context: Context;
  dispose(): Promise<void>;
}

export async function createDshComposition(
  options: DshCompositionOptions,
): Promise<DshComposition> {
  const context = new Context();

  try {
    installConnection(context, {
      interactions: 'answer',
      transport: options.transport,
      ...(options.location ? { location: options.location } : {}),
    });
    await context.plugin(typertRegistryClient);
    await context.plugin(gatewayClient);

    for (const contribution of [
      commandsRemote,
      subagentsRemote,
      fileUploadRemote,
      sessionRemote,
      workspaceRemote,
    ]) {
      await context.remote.$mount(contribution);
    }

    await context.plugin(fileUploadClient);
    await context.plugin(sessionControllerClient);
    await context.plugin(workspaceControllerClient);

    return {
      context,
      dispose: () => context.fiber.dispose(),
    };
  } catch (error) {
    await context.fiber.dispose();
    throw error;
  }
}
