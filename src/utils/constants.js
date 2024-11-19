import {Platform} from 'react-native';

export const socketURL =
  Platform.OS === 'android'
    ? 'http://10.0.1.1:3500'
    : 'http://192.168.0.101:3500';
