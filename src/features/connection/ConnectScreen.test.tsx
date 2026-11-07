import { act } from 'react';
import { createRoot } from 'test-renderer';

import { ConnectScreen } from './ConnectScreen';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
}));

jest.mock('./ConnectionProvider', () => ({
  useConnection: () => ({
    controller: { connect: jest.fn() },
    snapshot: { status: 'disconnected' },
  }),
}));

describe('ConnectScreen', () => {
  it('toggles launch-token visibility', async () => {
    const renderer = createRoot();
    await act(async () => {
      renderer.render(<ConnectScreen />);
    });

    const tokenInput = () => renderer.container.queryAll(
      node => node.props.accessibilityLabel === 'DSH launch token',
    )[0];
    const visibilityButton = () => renderer.container.queryAll(
      node => (node.props.accessibilityLabel === 'Show launch token'
        || node.props.accessibilityLabel === 'Hide launch token')
        && typeof node.props.onClick === 'function',
    )[0];

    expect(tokenInput().props.secureTextEntry).toBe(true);
    await act(async () => {
      visibilityButton().props.onClick();
    });
    expect(tokenInput().props.secureTextEntry).toBe(false);

    await act(async () => {
      visibilityButton().props.onClick();
    });
    expect(tokenInput().props.secureTextEntry).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });
});
