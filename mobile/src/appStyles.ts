import { StyleSheet } from 'react-native';

import { appShellStyles } from './styles/appShellStyles';
import { authStyles } from './styles/authStyles';
import { browseStyles } from './styles/browseStyles';
import { dashboardStyles } from './styles/dashboardStyles';
import { detailStyles } from './styles/detailStyles';
import { editorStyles } from './styles/editorStyles';
import { homeFeedStyles } from './styles/homeFeedStyles';
import { messagingStyles } from './styles/messagingStyles';
import { modalStyles } from './styles/modalStyles';
import { splashStyles } from './styles/splashStyles';

export const styles = StyleSheet.create({
  ...appShellStyles,
  ...browseStyles,
  ...detailStyles,
  ...messagingStyles,
  ...splashStyles,
  ...authStyles,
  ...dashboardStyles,
  ...modalStyles,
  ...editorStyles,
  ...homeFeedStyles,
} as const);
