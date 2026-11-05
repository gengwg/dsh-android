import type { Context } from '@deepseek-ai/cordis';

import { NativeInteractionController } from './interactionController.ts';
import type {} from './remoteEvents';

export const inject = ['sessions', 'remote', 'remote.userQuestions'];

/** Cordis client plugin; pass the screen-owned controller as config. */
export function apply(
  ctx: Context,
  controller: NativeInteractionController = new NativeInteractionController(),
): void {
  ctx.effect(() => {
    const stopApproval = ctx.remote.$on('approval/request', function (request, next) {
      const sessionId = ctx.sessions.scopeOf(this);
      if (sessionId === undefined) return next();
      return controller.receiveApproval(sessionId, request, next);
    });
    const stopQuestions = ctx.remote.$on('user-questions/request', function (request, next) {
      const sessionId = ctx.sessions.scopeOf(this);
      if (sessionId === undefined) return next();
      return controller.receiveQuestions(sessionId, request, ctx.remote.userQuestions, next);
    });
    return () => {
      stopApproval();
      stopQuestions();
      controller.dispose();
    };
  }, 'native-interactions: requests');
}

export const nativeInteractions = { inject, apply };
export default nativeInteractions;
