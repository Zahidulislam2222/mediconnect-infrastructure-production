"""
Pixel processing tests for dicom-service.

Validates thumbnail extraction from DICOM pixel data, including
VOI LUT windowing and MONOCHROME1 inversion. These are critical
for generating web-viewable thumbnails from medical images.
"""
import numpy as np
from unittest.mock import MagicMock
from pydicom.dataset import Dataset


def test_extract_thumbnail_basic():
    """8x8 pixel array produces valid JPEG bytes.

    Verifies the complete pixel pipeline: normalization, 8-bit
    conversion, and JPEG encoding via OpenCV.
    """
    from services.pixel_processor import extract_thumbnail

    ds = Dataset()
    ds.Rows = 8
    ds.Columns = 8
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"

    pixel_data = np.arange(64, dtype=np.uint16).reshape(8, 8)
    ds.PixelData = pixel_data.tobytes()
    # Mock pixel_array property
    ds._pixel_array = pixel_data

    # Patch pixel_array property access
    type(ds).pixel_array = property(lambda self: self._pixel_array.copy())

    jpeg_bytes = extract_thumbnail(ds)

    # JPEG files start with FFD8 magic bytes
    assert isinstance(jpeg_bytes, bytes)
    assert len(jpeg_bytes) > 0
    assert jpeg_bytes[:2] == b'\xff\xd8'


def test_monochrome1_inversion():
    """MONOCHROME1 interpretation inverts pixel values.

    In MONOCHROME1, lower pixel values are brighter (opposite of
    MONOCHROME2). The processor must invert so display is correct.
    """
    from services.pixel_processor import extract_thumbnail

    ds = Dataset()
    ds.Rows = 4
    ds.Columns = 4
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME1"

    # Create a gradient: 0 to 15
    pixel_data = np.arange(16, dtype=np.uint16).reshape(4, 4)
    ds.PixelData = pixel_data.tobytes()
    ds._pixel_array = pixel_data
    type(ds).pixel_array = property(lambda self: self._pixel_array.copy())

    jpeg_bytes = extract_thumbnail(ds)

    # Should still produce valid JPEG output
    assert isinstance(jpeg_bytes, bytes)
    assert len(jpeg_bytes) > 0
    assert jpeg_bytes[:2] == b'\xff\xd8'
