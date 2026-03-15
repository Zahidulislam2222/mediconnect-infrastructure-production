
import numpy as np
import cv2
import pydicom
from pydicom.dataset import FileDataset

def extract_thumbnail(dataset: FileDataset) -> bytes:
    """
    Extracts 12/16-bit multi-channel pixel data from a DICOM file, applies 
    Window Center/Width (VOI LUT) normalization via NumPy, and returns an 8-bit JPEG.
    """
    if not hasattr(dataset, 'pixel_array'):
        raise ValueError("DICOM file does not contain pixel data.")

    pixel_array = dataset.pixel_array

    # 1. Extract Window Center/Width (VOI LUT)
    window_center = dataset.get('WindowCenter', None)
    window_width = dataset.get('WindowWidth', None)

    # Handle multi-frame or arrays of windows
    if isinstance(window_center, list) or isinstance(window_center, pydicom.multival.MultiValue):
        window_center = window_center[0]
    if isinstance(window_width, list) or isinstance(window_width, pydicom.multival.MultiValue):
        window_width = window_width[0]

    # 2. Apply Medical Windowing (Standard VOI LUT Math)
    if window_center is not None and window_width is not None:
        window_min = window_center - (window_width / 2)
        window_max = window_center + (window_width / 2)
        
        # NumPy clipping for performance
        pixel_array = np.clip(pixel_array, window_min, window_max)
        pixel_array = ((pixel_array - window_min) / window_width) * 255.0
    else:
        # Fallback: Min/Max normalization if no Window tags exist
        p_min = pixel_array.min()
        p_max = pixel_array.max()
        if p_max != p_min:
            pixel_array = ((pixel_array - p_min) / (p_max - p_min)) * 255.0
            
    # 3. Handle Photometric Interpretation
    photo_interp = dataset.get('PhotometricInterpretation', '')
    if 'MONOCHROME1' in photo_interp:
        # In MONOCHROME1, lower values are brighter. Invert it.
        pixel_array = 255.0 - pixel_array

    # 4. Convert to 8-bit unsigned integer
    image_8bit = pixel_array.astype(np.uint8)

    # 5. Encode to JPEG using OpenCV
    success, encoded_image = cv2.imencode('.jpg', image_8bit)
    if not success:
        raise RuntimeError("OpenCV failed to encode the pixel array.")

    return encoded_image.tobytes()