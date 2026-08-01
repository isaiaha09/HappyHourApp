import { useEffect, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { ActivityIndicator, Image, Text, View, type ImageResizeMode, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { styles } from '../appStyles';

type AuthenticatedImageProps = {
  headers?: Record<string, string>;
  resizeMode?: ImageResizeMode;
  sourceUri: string;
  style: StyleProp<ImageStyle>;
  wrapperStyle?: StyleProp<ViewStyle>;
};

const authenticatedImageCacheDirectoryName = 'authenticated-images';

function getImageExtension(uri: string) {
  const path = uri.split(/[?#]/, 1)[0] ?? '';
  const match = path.match(/\.([a-z0-9]+)$/i);
  const extension = match?.[1]?.toLowerCase();
  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(extension)) {
    return extension;
  }
  return 'jpg';
}

function getImageCacheKey(uri: string) {
  let hash = 0;
  for (let index = 0; index < uri.length; index += 1) {
    hash = ((hash << 5) - hash + uri.charCodeAt(index)) | 0;
  }
  return `${Math.abs(hash)}-${uri.length}.${getImageExtension(uri)}`;
}

function isRemoteUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

async function loadAuthenticatedImageUri(sourceUri: string, headers?: Record<string, string>) {
  if (!isRemoteUri(sourceUri)) {
    return sourceUri;
  }

  const cacheDirectory = new Directory(Paths.cache, authenticatedImageCacheDirectoryName);
  if (!cacheDirectory.exists) {
    cacheDirectory.create({ intermediates: true, idempotent: true });
  }

  const cacheFile = new File(cacheDirectory, getImageCacheKey(sourceUri));
  if (cacheFile.exists) {
    return cacheFile.uri;
  }

  try {
    const download = await File.downloadFileAsync(sourceUri, cacheFile, { headers, idempotent: true });
    return download.uri;
  } catch (error) {
    if (cacheFile.exists) {
      cacheFile.delete();
    }
    throw error;
  }
}

export function AuthenticatedImage({ headers, resizeMode = 'cover', sourceUri, style, wrapperStyle }: AuthenticatedImageProps) {
  const [displayUri, setDisplayUri] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    setDisplayUri('');
    setFailed(false);

    void loadAuthenticatedImageUri(sourceUri, headers)
      .then((nextUri) => {
        if (mounted) {
          setDisplayUri(nextUri);
        }
      })
      .catch(() => {
        if (mounted) {
          setFailed(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [headers, sourceUri]);

  if (failed) {
    return (
      <View style={[style, wrapperStyle, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.dashboardSupportText}>Photo unavailable.</Text>
      </View>
    );
  }

  if (!displayUri) {
    return (
      <View style={[style, wrapperStyle, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#9e5b49" />
      </View>
    );
  }

  return <Image resizeMode={resizeMode} source={{ uri: displayUri }} style={style} />;
}