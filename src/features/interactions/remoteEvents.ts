import type {} from '@deepseek-ai/dsh-user-approval/types';
import type {} from '@deepseek-ai/dsh-user-questions/types';

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection {
    'approval/request': true;
    'user-questions/request': true;
  }
}

export {};
