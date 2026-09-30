import React, { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { BrokenImage as BrokenImageIcon } from '@mui/icons-material';
import { getAuthenticatedImageBlobUrl, getImageFileId } from '../../utils/imageUtils';

/**
 * Loads a protected ticket/query image with the session Bearer token.
 */
const AuthenticatedImage = ({
    resourceType,
    resourceId,
    imageId,
    image,
    alt = 'Image',
    sx = {},
    onLoad,
    onError,
    ...props
}) => {
    const resolvedId = imageId || getImageFileId(image);
    const [src, setSrc] = useState('');
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        let cancelled = false;

        if (!resourceType || !resourceId || !resolvedId) {
            setStatus('error');
            return undefined;
        }

        setStatus('loading');
        setSrc('');

        getAuthenticatedImageBlobUrl(resourceType, resourceId, resolvedId)
            .then((url) => {
                if (cancelled) return;
                setSrc(url);
                setStatus('ready');
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('Authenticated image load failed:', err);
                setStatus('error');
                if (onError) onError(err);
            });

        return () => {
            cancelled = true;
        };
    }, [resourceType, resourceId, resolvedId]);

    if (status === 'loading') {
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.200',
                    ...sx,
                }}
            >
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (status === 'error' || !src) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.200',
                    color: 'text.secondary',
                    ...sx,
                }}
            >
                <BrokenImageIcon />
            </Box>
        );
    }

    return (
        <Box
            component="img"
            src={src}
            alt={alt}
            sx={sx}
            onLoad={onLoad}
            onError={(e) => {
                setStatus('error');
                if (onError) onError(e);
            }}
            {...props}
        />
    );
};

export default AuthenticatedImage;
