import React, { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Image } from "expo-image";

type ExpoImageProps = ComponentProps<typeof Image>;

interface FallbackImageProps extends Omit<ExpoImageProps, "source"> {
  primaryUri?: string;
  fallbackUri?: string;
  emptyPlaceholder: ReactNode;
}

export function FallbackImage({
  primaryUri,
  fallbackUri,
  emptyPlaceholder,
  ...rest
}: FallbackImageProps) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [primaryUri, fallbackUri]);

  let activeUri: string | undefined;
  let usingFallback = false;
  if (primaryUri && !primaryFailed) {
    activeUri = primaryUri;
  } else if (fallbackUri && !fallbackFailed) {
    activeUri = fallbackUri;
    usingFallback = true;
  }

  if (!activeUri) {
    return <>{emptyPlaceholder}</>;
  }

  return (
    <Image
      {...rest}
      source={{ uri: activeUri }}
      onError={() => {
        if (usingFallback) {
          setFallbackFailed(true);
        } else {
          setPrimaryFailed(true);
        }
      }}
    />
  );
}
