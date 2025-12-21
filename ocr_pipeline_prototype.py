#!/usr/bin/env python3
"""
Powerball Ticket OCR Pipeline Prototype

A structured approach using computer vision and template matching instead of general OCR.

Pipeline Steps:
1. Find yellow strip for orientation
2. Apply homography + rotation to normalize
3. Find POWER PLAY NO header and dashes
4. Crop plays area (including drawing date)
5. Apply adaptive binarization
6. Template match for digits
7. Extract plays from known positions
8. Validate and correct
"""

import cv2
import numpy as np
import json
import os
import sys
import time
from pathlib import Path
from typing import Tuple, List, Dict, Optional

# Import HEIC support
try:
    from PIL import Image
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_SUPPORT = True
except ImportError:
    HEIC_SUPPORT = False
    print("Warning: HEIC support not available. Install pillow-heif for HEIC images.")


class PipelineProfiler:
    """Profile pipeline execution times."""

    def __init__(self):
        self.timings = {}
        self.current_step = None
        self.start_time = None

    def start_step(self, step_name: str):
        """Start timing a step."""
        self.current_step = step_name
        self.start_time = time.perf_counter()

    def end_step(self):
        """End timing current step."""
        if self.current_step and self.start_time:
            elapsed = time.perf_counter() - self.start_time
            self.timings[self.current_step] = elapsed
            print(f"  [{self.current_step}] {elapsed*1000:.2f}ms")
            self.current_step = None
            self.start_time = None

    def save(self, filepath: str):
        """Save profiling data to JSON."""
        with open(filepath, 'w') as f:
            json.dump({
                'timings_ms': {k: v*1000 for k, v in self.timings.items()},
                'total_ms': sum(self.timings.values()) * 1000
            }, f, indent=2)


class TicketOCRPipeline:
    """Main OCR pipeline for Powerball tickets."""

    def __init__(self, output_dir: str = "pipeline_output", templates_dir: str = "digit_templates"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.profiler = PipelineProfiler()

        # Expected ticket structure (will be refined based on actual tickets)
        self.yellow_strip_hsv_range = {
            'lower': np.array([20, 100, 100]),  # Yellow in HSV
            'upper': np.array([30, 255, 255])
        }

        # Initialize EasyOCR reader (lazy load)
        self.ocr_reader = None

        # Template matching
        self.templates_dir = Path(templates_dir)
        self.digit_templates = {}
        self.pb_template = None
        self._load_templates()

    def get_ocr_reader(self):
        """Lazy load EasyOCR reader."""
        if self.ocr_reader is None:
            try:
                import easyocr
                print("  Loading EasyOCR reader (this may take a moment)...")
                self.ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
                print("  ✓ EasyOCR ready")
            except Exception as e:
                print(f"  ✗ EasyOCR not available: {e}")
                self.ocr_reader = False  # Mark as unavailable
        return self.ocr_reader if self.ocr_reader is not False else None

    def _load_templates(self):
        """Load digit and PB marker templates."""
        print("Loading digit templates...")

        # Load digit templates (0-9)
        for digit in range(10):
            template_path = self.templates_dir / f'digit_{digit}.png'
            if template_path.exists():
                self.digit_templates[digit] = cv2.imread(str(template_path), cv2.IMREAD_GRAYSCALE)
                print(f"  ✓ Loaded template for digit {digit}")
            else:
                print(f"  ✗ Missing template for digit {digit}")

        # Load PB marker template
        pb_path = self.templates_dir / 'marker_pb.png'
        if pb_path.exists():
            self.pb_template = cv2.imread(str(pb_path), cv2.IMREAD_GRAYSCALE)
            print(f"  ✓ Loaded PB marker template")
        else:
            print(f"  ✗ Missing PB marker template")

        if len(self.digit_templates) == 10 and self.pb_template is not None:
            print(f"  ✓ All templates loaded successfully")
        else:
            print(f"  ✗ Warning: Missing {10 - len(self.digit_templates)} digit templates")

    def match_digit_template(self, digit_img: np.ndarray, debug: bool = False) -> Tuple[Optional[int], float]:
        """
        Match a digit image against all templates using multi-scale matching.

        Returns:
            (digit, confidence) or (None, 0.0) if no good match
        """
        if not self.digit_templates:
            return None, 0.0

        best_match = None
        best_score = 0.0
        scores = {}

        # Try each digit template with multiple scales
        for digit, template in self.digit_templates.items():
            digit_best_score = 0.0

            # Try multiple scales for better matching
            for scale in [0.85, 0.925, 1.0, 1.075, 1.15]:
                try:
                    # Scale the template
                    scaled_template = cv2.resize(
                        template,
                        (int(template.shape[1] * scale), int(template.shape[0] * scale))
                    )

                    # Resize digit_img to match scaled template size
                    resized = cv2.resize(digit_img, (scaled_template.shape[1], scaled_template.shape[0]))

                    # Use normalized correlation for matching
                    result = cv2.matchTemplate(resized, scaled_template, cv2.TM_CCOEFF_NORMED)
                    score = result[0, 0]

                    if score > digit_best_score:
                        digit_best_score = score
                except Exception as e:
                    continue

            scores[digit] = digit_best_score

            if digit_best_score > best_score:
                best_score = digit_best_score
                best_match = digit

        if debug:
            print(f"      Match scores: {sorted(scores.items(), key=lambda x: x[1], reverse=True)[:3]}")

        # Require minimum confidence threshold
        if best_score < 0.4:
            return None, best_score

        return best_match, best_score

    def match_pb_marker(self, region_img: np.ndarray) -> Tuple[bool, float]:
        """
        Check if a region matches the PB marker template.
        Uses multi-scale matching for better robustness.

        Returns:
            (is_pb, confidence)
        """
        if self.pb_template is None:
            return False, 0.0

        try:
            best_score = 0.0

            # Try multiple scales (0.8x to 1.2x)
            for scale in [0.8, 0.9, 1.0, 1.1, 1.2]:
                # Scale the template
                scaled_template = cv2.resize(
                    self.pb_template,
                    (int(self.pb_template.shape[1] * scale), int(self.pb_template.shape[0] * scale))
                )

                # Resize region to match scaled template size
                try:
                    resized = cv2.resize(region_img, (scaled_template.shape[1], scaled_template.shape[0]))

                    # Use normalized correlation
                    result = cv2.matchTemplate(resized, scaled_template, cv2.TM_CCOEFF_NORMED)
                    score = result[0, 0]

                    if score > best_score:
                        best_score = score
                except:
                    continue

            # PB marker confidence threshold (slightly lowered for better detection)
            return best_score > 0.6, best_score
        except Exception as e:
            return False, 0.0

    def save_debug_image(self, name: str, image: np.ndarray):
        """Save intermediate image for debugging."""
        filepath = self.output_dir / f"{name}.png"
        cv2.imwrite(str(filepath), image)
        print(f"  Saved: {filepath}")

    def load_image(self, image_path: str) -> np.ndarray:
        """Load image, convert to grayscale, and binarize immediately."""
        self.profiler.start_step("load_image")

        path = Path(image_path)

        if path.suffix.lower() in ['.heic', '.heif']:
            if not HEIC_SUPPORT:
                raise RuntimeError("HEIC support not available. Install pillow-heif.")

            # Load HEIC using PIL
            pil_image = Image.open(image_path)
            # Convert to RGB numpy array
            image = np.array(pil_image.convert('RGB'))
            # Convert RGB to BGR for OpenCV
            image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        else:
            # Load directly with OpenCV
            image = cv2.imread(image_path)

        if image is None:
            raise ValueError(f"Could not load image: {image_path}")

        self.save_debug_image("01_original", image)

        # Convert to grayscale immediately
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        self.save_debug_image("02_grayscale", gray)

        # Binarize using Otsu's method (works best for this type of image)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        self.save_debug_image("03_binary", binary)

        print(f"  Loaded and binarized: {binary.shape[1]}x{binary.shape[0]} pixels")

        self.profiler.end_step()
        return binary

    def find_yellow_strip(self, image: np.ndarray) -> Tuple[Optional[np.ndarray], Dict]:
        """
        Find the yellow strip on the left side of the ticket.

        Returns:
            contour: Contour of yellow strip if found
            info: Dictionary with strip info (angle, position, etc.)
        """
        self.profiler.start_step("find_yellow_strip")

        # Convert to HSV for better color detection
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        # Create mask for yellow color
        mask = cv2.inRange(
            hsv,
            self.yellow_strip_hsv_range['lower'],
            self.yellow_strip_hsv_range['upper']
        )

        self.save_debug_image("02_yellow_mask", mask)

        # Clean up mask with morphological operations
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        self.save_debug_image("02b_yellow_mask_cleaned", mask)

        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            self.profiler.end_step()
            return None, {'found': False, 'reason': 'No yellow regions detected'}

        # Find largest contour (should be the strip)
        strip_contour = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(strip_contour)

        # Get bounding rectangle
        x, y, w, h = cv2.boundingRect(strip_contour)

        # Validate it's strip-like (tall and narrow)
        aspect_ratio = h / w if w > 0 else 0

        # Draw debug visualization
        debug_img = image.copy()
        cv2.drawContours(debug_img, [strip_contour], -1, (0, 255, 0), 3)
        cv2.rectangle(debug_img, (x, y), (x+w, y+h), (255, 0, 0), 2)
        self.save_debug_image("03_yellow_strip_detected", debug_img)

        info = {
            'found': True,
            'area': area,
            'bbox': (x, y, w, h),
            'aspect_ratio': aspect_ratio,
            'center': (x + w//2, y + h//2)
        }

        self.profiler.end_step()
        return strip_contour, info

    def normalize_orientation(self, image: np.ndarray) -> Tuple[np.ndarray, Dict]:
        """
        Normalize the ticket orientation and perspective using QR code.
        Detects the full ticket boundaries and crops to the ticket.

        Note: Input image is already binary (white text/QR on black background).

        Returns the entire normalized ticket, ready for region extraction.
        """
        self.profiler.start_step("normalize_orientation")

        # STEP 1: Auto-rotate based on image orientation and QR code position
        # Powerball tickets are portrait (taller than wide), so rotate landscape images
        height, width = image.shape[:2]
        auto_rotation = 0
        working_image = image.copy()

        # Image is already binary, but QR detection works better with different preprocessing
        # Try QR code detection with multiple approaches
        qr_detector = cv2.QRCodeDetector()

        # Try multiple preprocessing for QR detection
        # Invert binary for some attempts (QR codes are typically black on white)
        binary_inverted = cv2.bitwise_not(image)
        preprocessed_attempts = [
            ("binary", image),
            ("binary_inverted", binary_inverted),
            ("contrast", cv2.equalizeHist(binary_inverted))
        ]

        qr_points = None
        qr_data = None

        for name, prep_img in preprocessed_attempts:
            data, points, _ = qr_detector.detectAndDecode(prep_img)
            if points is not None and len(points) > 0:
                qr_points = points[0]
                qr_data = data
                print(f"  ✓ QR code detected using {name} preprocessing")
                break

        # Detect if image needs rotation based on QR code position
        if qr_points is not None:
            # Get QR code position relative to image
            x_coords = qr_points[:, 0]
            y_coords = qr_points[:, 1]
            qr_center_x = np.mean(x_coords)
            qr_center_y = np.mean(y_coords)

            # Calculate QR position as percentage of image dimensions
            qr_x_pct = qr_center_x / width
            qr_y_pct = qr_center_y / height

            print(f"  QR code at ({qr_center_x:.0f}, {qr_center_y:.0f})")
            print(f"  QR position: {qr_x_pct*100:.1f}% from left, {qr_y_pct*100:.1f}% from top")

            # For a correctly oriented portrait ticket:
            # - QR should be near bottom (Y > 80%)
            # - QR should be centered horizontally (X ≈ 50%)

            # If image is landscape (width > height), we need to rotate
            if width > height:
                print(f"  Image is landscape ({width}x{height}), needs rotation")
                # Determine rotation direction based on QR position
                # If QR is in right half (X > 0.5), rotate 90° clockwise
                # If QR is in left half (X < 0.5), rotate 270° (90° counter-clockwise)
                if qr_x_pct > 0.5:
                    auto_rotation = 90
                else:
                    auto_rotation = 270
                print(f"  Auto-rotating {auto_rotation}° based on QR position")

                # Apply rotation
                if auto_rotation == 90:
                    working_image = cv2.rotate(working_image, cv2.ROTATE_90_CLOCKWISE)
                elif auto_rotation == 270:
                    working_image = cv2.rotate(working_image, cv2.ROTATE_90_COUNTERCLOCKWISE)

                # Re-detect QR code after rotation (image is already binary)
                binary_inverted = cv2.bitwise_not(working_image)
                for name, prep_img in [
                    ("binary", working_image),
                    ("binary_inverted", binary_inverted)
                ]:
                    data, points, _ = qr_detector.detectAndDecode(prep_img)
                    if points is not None and len(points) > 0:
                        qr_points = points[0]
                        break

            # Check if upside down (QR at top instead of bottom after rotation)
            elif qr_y_pct < 0.4:  # QR in top 40% of portrait image
                print(f"  Image appears upside down (QR at top), rotating 180°")
                auto_rotation = 180
                working_image = cv2.rotate(working_image, cv2.ROTATE_180)

                # Re-detect QR code after rotation (image is already binary)
                binary_inverted = cv2.bitwise_not(working_image)
                for name, prep_img in [
                    ("binary", working_image),
                    ("binary_inverted", binary_inverted)
                ]:
                    data, points, _ = qr_detector.detectAndDecode(prep_img)
                    if points is not None and len(points) > 0:
                        qr_points = points[0]
                        break

        orientation_info = {'auto_rotation': auto_rotation}

        if qr_points is not None:
            # QR code found - use homography transform for full perspective correction

            # Get QR code bounding box (after any rotation)
            x_coords = qr_points[:, 0]
            y_coords = qr_points[:, 1]
            qr_center_x = np.mean(x_coords)
            qr_center_y = np.mean(y_coords)
            qr_width = np.max(x_coords) - np.min(x_coords)
            qr_height = np.max(y_coords) - np.min(y_coords)
            qr_size = max(qr_width, qr_height)

            print(f"  QR code at ({qr_center_x:.0f}, {qr_center_y:.0f}), size: {qr_size:.0f}px")

            # Calculate estimated ticket dimensions based on QR code for canvas size
            # Use generous canvas to ensure we capture the whole ticket
            est_ticket_width = int(qr_size * 6.5)  # Slightly larger than expected
            est_ticket_height = int(qr_size * 12)  # Slightly larger than expected

            # Define destination points for a perfectly rectangular QR code
            # Position QR in center of canvas
            qr_y_position = est_ticket_height - int(qr_size * 2)  # Leave margin at bottom
            qr_x_position = (est_ticket_width - qr_size) // 2  # Centered horizontally

            dst_qr_points = np.float32([
                [qr_x_position, qr_y_position],  # Top-left
                [qr_x_position + qr_size, qr_y_position],  # Top-right
                [qr_x_position + qr_size, qr_y_position + qr_size],  # Bottom-right
                [qr_x_position, qr_y_position + qr_size]  # Bottom-left
            ])

            # Source points are the detected QR corners
            src_qr_points = np.float32(qr_points)

            # Compute homography matrix
            H = cv2.getPerspectiveTransform(src_qr_points, dst_qr_points)

            # Apply perspective transform with white background
            # Note: Image is binary (grayscale), so borderValue is just 0 (black background)
            warped = cv2.warpPerspective(working_image, H, (est_ticket_width, est_ticket_height),
                                        flags=cv2.INTER_LINEAR,
                                        borderMode=cv2.BORDER_CONSTANT,
                                        borderValue=0)

            print(f"  Applied homography transform to canvas: {est_ticket_width}x{est_ticket_height}")

            # Now detect the actual ticket boundaries
            # The ticket is white content on black background, so find the bounding box
            # Invert to get black ticket on white for contour detection
            inverted_for_detection = cv2.bitwise_not(warped)

            # Find contours
            contours, _ = cv2.findContours(inverted_for_detection, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if contours:
                # Find the largest contour (should be the ticket)
                ticket_contour = max(contours, key=cv2.contourArea)
                x, y, w, h = cv2.boundingRect(ticket_contour)

                # Add small padding
                padding = 10
                x = max(0, x - padding)
                y = max(0, y - padding)
                w = min(warped.shape[1] - x, w + 2*padding)
                h = min(warped.shape[0] - y, h + 2*padding)

                # Crop to ticket boundaries
                normalized = warped[y:y+h, x:x+w]

                print(f"  Detected ticket boundaries: {w}x{h} (cropped from canvas)")
                orientation_info['ticket_detected'] = True
                orientation_info['ticket_bbox'] = (x, y, w, h)
            else:
                # Fallback: use the warped image as-is
                normalized = warped
                print(f"  Could not detect ticket boundaries, using full canvas")
                orientation_info['ticket_detected'] = False

            # Visualize QR code on the rotated image (convert to BGR for colored visualization)
            debug_img = cv2.cvtColor(working_image, cv2.COLOR_GRAY2BGR)
            qr_points_int = np.int32(qr_points)
            cv2.polylines(debug_img, [qr_points_int], True, (0, 255, 255), 3)
            for i, pt in enumerate(qr_points_int):
                cv2.circle(debug_img, tuple(pt), 5, (0, 255, 0), -1)
                cv2.putText(debug_img, str(i), tuple(pt), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)
            self.save_debug_image("04a_qr_detected", debug_img)

            orientation_info.update({
                'method': 'qr_homography',
                'qr_found': True,
                'ticket_width': normalized.shape[1],
                'ticket_height': normalized.shape[0]
            })

        else:
            # Fallback to yellow strip rotation
            print("  QR code not found, using yellow strip for orientation")

            hsv = cv2.cvtColor(working_image, cv2.COLOR_BGR2HSV)
            mask = cv2.inRange(hsv, self.yellow_strip_hsv_range['lower'], self.yellow_strip_hsv_range['upper'])

            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if contours:
                strip_contour = max(contours, key=cv2.contourArea)
                rect = cv2.minAreaRect(strip_contour)
                angle = rect[2]
                width, height = rect[1]

                if width > height:
                    angle = angle + 90
                    width, height = height, width

                angle = -angle if abs(angle) < 45 else -(angle - 90)

                print(f"  ✓ Yellow strip detected, angle: {angle:.2f}°")

                # Apply rotation
                (h, w) = working_image.shape[:2]
                center = (w // 2, h // 2)

                M_rot = cv2.getRotationMatrix2D(center, angle, 1.0)

                # Calculate new dimensions
                cos = np.abs(M_rot[0, 0])
                sin = np.abs(M_rot[0, 1])
                new_w = int((h * sin) + (w * cos))
                new_h = int((h * cos) + (w * sin))

                # Adjust rotation matrix
                M_rot[0, 2] += (new_w / 2) - center[0]
                M_rot[1, 2] += (new_h / 2) - center[1]

                # Apply rotation
                normalized = cv2.warpAffine(working_image, M_rot, (new_w, new_h),
                                        flags=cv2.INTER_LINEAR,
                                        borderMode=cv2.BORDER_CONSTANT,
                                        borderValue=(255, 255, 255))

                print(f"  Applied rotation: {angle:.2f}°")

                orientation_info.update({
                    'method': 'yellow_strip',
                    'angle': angle,
                    'qr_found': False
                })
            else:
                print("  ⚠ No orientation reference found, assuming upright")
                normalized = working_image
                orientation_info.update({
                    'method': 'none',
                    'qr_found': False
                })

        self.save_debug_image("04_normalized", normalized)
        self.profiler.end_step()
        return normalized, orientation_info

    def find_qr_code(self, image: np.ndarray) -> Tuple[Optional[np.ndarray], Optional[int], Dict]:
        """
        Find QR code with multiple preprocessing attempts.
        Note: Input image is already binary.

        Returns:
            qr_points: Corner points of QR code
            qr_top_y: Top y-coordinate of QR code
            info: Dictionary with QR code info
        """
        # Image is already binary, try different approaches
        qr_detector = cv2.QRCodeDetector()

        # Invert for QR detection (QR codes are typically black on white)
        binary_inverted = cv2.bitwise_not(image)

        # Try multiple preprocessing approaches
        attempts = [
            ("binary", image),
            ("binary_inverted", binary_inverted),
            ("contrast", cv2.equalizeHist(binary_inverted))
        ]

        for name, preprocessed in attempts:
            qr_data, qr_points, _ = qr_detector.detectAndDecode(preprocessed)

            if qr_points is not None and len(qr_points) > 0:
                qr_points = qr_points[0]
                qr_top_y = int(np.min(qr_points[:, 1]))

                # Visualize QR code (convert to BGR for colored visualization)
                debug_img = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
                qr_points_int = np.int32(qr_points)
                cv2.polylines(debug_img, [qr_points_int], True, (0, 255, 255), 3)
                cv2.line(debug_img, (0, qr_top_y), (image.shape[1], qr_top_y), (0, 255, 255), 2)
                self.save_debug_image("05a_qr_detected", debug_img)

                print(f"  ✓ QR code detected at y={qr_top_y} (using {name} preprocessing)")
                return qr_points, qr_top_y, {'found': True, 'top_y': qr_top_y, 'method': name}

        print("  ✗ QR code not detected (tried multiple preprocessing methods)")
        return None, None, {'found': False}

    def find_plays_region(self, image: np.ndarray) -> Tuple[Optional[np.ndarray], Dict]:
        """
        Find the plays region using QR code and barcode.

        Process:
        1. Find QR code (bottom anchor)
        2. Crop to region above QR code
        3. Find barcode in that region (top anchor)
        4. Extract plays between barcode and QR code

        Returns:
            cropped: Cropped image containing just the plays
            info: Dictionary with region info
        """
        self.profiler.start_step("find_plays_region")

        # Step 1: Find QR code
        qr_points, qr_top_y, qr_info = self.find_qr_code(image)

        if not qr_info['found']:
            print("  ✗ Cannot proceed without QR code")
            self.profiler.end_step()
            return None, {'found': False, 'reason': 'No QR code detected'}

        # Step 2: Crop to region above QR code
        above_qr = image[0:qr_top_y, :]
        self.save_debug_image("05b_above_qr", above_qr)
        print(f"  Cropped to region above QR code: {above_qr.shape[0]}px tall")

        # Step 3: Find the horizontal dashed line that separates header from plays
        # This line appears just above the first play (001) and below "POWER PLAY NO"
        # Image is already binary, no need to convert
        binary_cropped = above_qr
        self.save_debug_image("05c_binary_cropped", binary_cropped)

        # For a properly normalized ticket:
        # - Image height is approximately QR_size * 10.8
        # - Plays region should span approximately 20-22% of image height
        # - Plays region should end just above QR code (at ~86% from top)
        # - Therefore, plays region should START at approximately 64-66% from top
        # Search for dashed line in the range of 58-72% of image height
        search_start_y = int(0.58 * above_qr.shape[0])
        search_end_y = int(0.72 * above_qr.shape[0])
        search_region = binary_cropped[search_start_y:search_end_y, :]

        # Use horizontal projection to find dashed lines
        horizontal_projection = np.sum(search_region, axis=1)

        # Normalize
        max_proj = np.max(horizontal_projection) if len(horizontal_projection) > 0 else 0
        if max_proj > 0:
            normalized_proj = horizontal_projection / max_proj
        else:
            normalized_proj = horizontal_projection

        # Find candidate dashed lines (sparse horizontal patterns)
        # Dashed lines have consistent but not full coverage (15-50% density)
        # Skip lines too close to the top of search region (first 20 pixels)
        # Look for THIN consistent patterns (1-5 pixels tall), not thick barcodes
        dashed_line_candidates = []
        for i, proj_val in enumerate(normalized_proj):
            if i > 20 and 0.15 < proj_val < 0.5:
                # Check if this is a thin line by looking at surrounding rows
                # A true dashed line will have 1-5 rows with similar density
                # A barcode will have 20+ rows with varying density
                similar_count = 1
                for offset in range(1, 6):
                    if i + offset < len(normalized_proj):
                        next_val = normalized_proj[i + offset]
                        if abs(next_val - proj_val) < 0.1:  # Similar density
                            similar_count += 1
                        else:
                            break

                # Only accept if it's a thin line (2-5 rows of similar density)
                if 2 <= similar_count <= 5:
                    dashed_line_candidates.append((i, proj_val))

        # Visualize search and results
        debug_search = above_qr.copy()
        cv2.rectangle(debug_search, (0, search_start_y), (above_qr.shape[1], above_qr.shape[0]),
                     (255, 255, 0), 2)  # Cyan search region

        boundary_found = False
        boundary_y_in_crop = None

        if dashed_line_candidates:
            # Take the first dashed line in the search region
            first_dash_y_in_search, proj_val = dashed_line_candidates[0]
            # Add offset to skip past the dashed line and numeric codes to reach "POWER PLAY NO"
            boundary_y_in_crop = search_start_y + first_dash_y_in_search + 55
            boundary_found = True

            # Draw the detected line
            line_y = search_start_y + first_dash_y_in_search
            cv2.line(debug_search, (0, line_y), (above_qr.shape[1], line_y), (0, 255, 0), 2)  # Green detected line
            cv2.line(debug_search, (0, boundary_y_in_crop), (above_qr.shape[1], boundary_y_in_crop),
                    (255, 0, 0), 3)  # Blue boundary line
            cv2.putText(debug_search, f"Dashed Line", (10, line_y - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(debug_search, f"Top Boundary", (10, boundary_y_in_crop + 25),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

            print(f"  ✓ Dashed line found at y={line_y} (density={proj_val:.2f})")
            print(f"  ✓ Boundary set to y={boundary_y_in_crop}")
        else:
            # Fallback: use proportional offset from QR code
            # Plays region typically starts at about 64-66% of the distance from top to QR code
            # Use 65% based on observed working examples
            boundary_y_in_crop = int(qr_top_y * 0.65)
            boundary_found = True

            cv2.line(debug_search, (0, boundary_y_in_crop), (above_qr.shape[1], boundary_y_in_crop),
                    (255, 0, 0), 3)  # Blue boundary line
            cv2.putText(debug_search, f"Top Boundary (fallback)", (10, boundary_y_in_crop - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

            print(f"  ⚠ No dashed line found, using proportional offset from QR code (65%)")
            print(f"  ✓ Boundary set to y={boundary_y_in_crop}")

        self.save_debug_image("05d_boundary_search", debug_search)

        # Step 4: Determine crop boundaries in original image coordinates
        if not boundary_found:
            print("  ✗ Cannot extract plays without boundary")
            self.profiler.end_step()
            return None, {'found': False, 'reason': 'No boundary detected'}

        # Convert coordinates back to original image
        # Top: at the detected boundary (above text)
        # Bottom: just above QR code
        top_y = boundary_y_in_crop
        bottom_y = qr_top_y - 20

        print(f"  ✓ Plays region boundaries:")
        print(f"    Top: {top_y} (above text region)")
        print(f"    Bottom: {bottom_y} (QR top - 20)")
        print(f"    Region height: {bottom_y - top_y}px")

        # Ensure boundaries are within image
        top_y = max(0, top_y)
        bottom_y = min(image.shape[0], bottom_y)

        if bottom_y - top_y < 100:
            print(f"  ✗ Region too small: {bottom_y - top_y}px")
            self.profiler.end_step()
            return None, {'found': False, 'reason': 'Region too small'}

        # Step 6: Crop to plays region
        # Also crop off the right margin (Q6 indicators, etc.) to avoid interference
        # Keep left 85% of width
        right_x = int(image.shape[1] * 0.85)
        cropped = image[top_y:bottom_y, 0:right_x]
        print(f"    Cropped width: 0 to {right_x} (85% of full width)")

        # Step 7: Draw final visualization
        debug_img = image.copy()

        # Draw top boundary (in original image coordinates)
        boundary_y_full = boundary_y_in_crop
        cv2.line(debug_img, (0, boundary_y_full), (image.shape[1], boundary_y_full), (255, 0, 0), 3)
        cv2.putText(debug_img, "Top Boundary", (10, boundary_y_full - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)

        # Draw QR code
        if qr_points is not None:
            qr_points_int = np.int32(qr_points)
            cv2.polylines(debug_img, [qr_points_int], True, (0, 255, 255), 3)
        cv2.line(debug_img, (0, qr_top_y), (image.shape[1], qr_top_y), (0, 255, 255), 3)
        cv2.putText(debug_img, "QR Code", (10, qr_top_y + 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

        # Draw crop boundaries
        cv2.line(debug_img, (0, top_y), (image.shape[1], top_y), (0, 0, 255), 4)  # Red
        cv2.line(debug_img, (0, bottom_y), (image.shape[1], bottom_y), (0, 0, 255), 4)  # Red
        cv2.rectangle(debug_img, (0, top_y), (image.shape[1], bottom_y), (0, 255, 0), 3)  # Green

        self.save_debug_image("06_final_boundaries", debug_img)
        self.save_debug_image("07_plays_cropped", cropped)

        info = {
            'found': True,
            'top_y': top_y,
            'bottom_y': bottom_y,
            'boundary_found': boundary_found,
            'qr_found': True,
            'height': bottom_y - top_y
        }

        self.profiler.end_step()
        return cropped, info

    def apply_adaptive_binarization(self, image: np.ndarray) -> np.ndarray:
        """Apply Otsu's binarization for better digit recognition."""
        self.profiler.start_step("adaptive_binarization")

        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Apply Otsu's threshold (same as used for binary_cropped)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        self.save_debug_image("08_adaptive_binary", binary)

        self.profiler.end_step()
        return binary

    def extract_plays_template_matching(self, image: np.ndarray) -> List[Dict]:
        """
        Extract plays using template matching for digits and PB marker.

        Strategy:
        1. Detect all PB markers in the entire region
        2. Detect ALL digits in the entire region
        3. Group digits by Y coordinate to form rows
        4. For each row, use PB marker X position to separate white balls from powerball
        """
        self.profiler.start_step("extract_plays")

        height, width = image.shape[:2] if len(image.shape) == 2 else image.shape[:2]

        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Apply morphological closing to connect broken parts
        kernel = np.ones((3, 3), np.uint8)
        gray_closed = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel, iterations=2)

        print(f"  Processing {height}px tall region...")

        # Step 1: Find all PB markers in the entire region using template matching
        print(f"  Detecting PB markers...")
        pb_markers = []  # List of (x, y, confidence)

        if self.pb_template is not None and gray_closed.shape[0] >= self.pb_template.shape[0] and gray_closed.shape[1] >= self.pb_template.shape[1]:
            # Use template matching to find all PB markers
            result = cv2.matchTemplate(gray_closed, self.pb_template, cv2.TM_CCOEFF_NORMED)

            # Find all matches above threshold (higher threshold to reduce false positives)
            threshold = 0.75
            locations = np.where(result >= threshold)

            # Collect all PB marker locations
            for pt in zip(*locations[::-1]):  # Switch x and y
                x, y = pt
                confidence = result[y, x]
                pb_markers.append((x, y, confidence))

            # Apply non-maximum suppression to remove duplicates
            # Group markers that are close together (within 30px)
            pb_markers_nms = []
            pb_markers.sort(key=lambda m: m[2], reverse=True)  # Sort by confidence

            for x, y, conf in pb_markers:
                # Check if this is far enough from existing markers
                is_duplicate = False
                for ex, ey, ec in pb_markers_nms:
                    if abs(x - ex) < 30 and abs(y - ey) < 30:
                        is_duplicate = True
                        break

                if not is_duplicate:
                    pb_markers_nms.append((x, y, conf))

            pb_markers = pb_markers_nms
            pb_markers.sort(key=lambda m: m[1])  # Sort by Y position

            print(f"  Found {len(pb_markers)} PB markers:")
            for x, y, conf in pb_markers:
                print(f"    PB at x={x:4d}, y={y:4d}, conf={conf:.3f}")
        else:
            print(f"  ✗ Cannot perform PB template matching (region or template issue)")

        # Step 2: Detect ALL digits in the entire region
        print(f"  Detecting all digits in region...")

        # Find contours in the entire region
        contours, _ = cv2.findContours(gray_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter contours by size - be more permissive to catch all digits
        min_height = 30  # Reduced from 45
        min_width = 15   # Reduced from 25
        max_width = 90   # Increased from 80
        min_area = 800   # Reduced from 1500
        max_area = 6000  # Increased from 5000

        digit_candidates = []  # List of (x, y, w, h, contour)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = cv2.contourArea(contour)

            # Filter by size
            if (h >= min_height and w >= min_width and w <= max_width and
                area >= min_area and area <= max_area):
                digit_candidates.append((x, y, w, h, contour))

        print(f"  Found {len(digit_candidates)} digit-sized contours")

        # Match all digits against templates
        all_digits = []  # List of (x, y, digit_value, confidence)
        for idx, (x, y, w, h, contour) in enumerate(digit_candidates):
            # Extract the digit region
            digit_img = gray_closed[y:y+h, x:x+w]

            # Match against templates
            debug_mode = idx < 3  # Debug first few
            digit, conf = self.match_digit_template(digit_img, debug=debug_mode)

            if digit is not None:
                # Store center Y position for grouping
                center_y = y + h // 2
                all_digits.append((x, center_y, digit, conf))
                if debug_mode:
                    print(f"    Digit {idx}: pos=({x},{y}), size={w}x{h}, digit={digit}, conf={conf:.3f}")

        print(f"  Matched {len(all_digits)} digits")

        # Debug: show X position distribution
        if all_digits:
            min_x = min(d[0] for d in all_digits)
            max_x = max(d[0] for d in all_digits)
            print(f"  Digit X range: {min_x} to {max_x}")
            # Show first 15 digits by X position with their Y values
            sorted_by_x = sorted(all_digits, key=lambda d: d[0])
            print(f"  First 15 digits (X, Y, digit): {[(x, y, d) for x, y, d, c in sorted_by_x[:15]]}")

        # Step 3: Group digits by Y coordinate to form rows
        print(f"  Grouping digits into rows by Y coordinate...")

        # Sort digits by Y position
        all_digits.sort(key=lambda d: d[1])

        # Group digits that are close together vertically (within 40px)
        # This accounts for slight skew/rotation from imperfect homography
        digit_rows = []
        if all_digits:
            current_row = [all_digits[0]]
            for i in range(1, len(all_digits)):
                prev_y = current_row[0][1]  # Y of first digit in current row
                curr_y = all_digits[i][1]

                # If within 40px vertically, same row
                if abs(curr_y - prev_y) <= 40:
                    current_row.append(all_digits[i])
                else:
                    # Start new row
                    digit_rows.append(current_row)
                    current_row = [all_digits[i]]

            # Add last row
            if current_row:
                digit_rows.append(current_row)

        print(f"  Grouped into {len(digit_rows)} rows")

        # Create debug visualization
        debug_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR) if len(gray.shape) == 2 else gray.copy()

        # Draw PB markers
        pb_w = self.pb_template.shape[1] if self.pb_template is not None else 90
        pb_h = self.pb_template.shape[0] if self.pb_template is not None else 88
        for pb_x, pb_y, pb_conf in pb_markers:
            cv2.rectangle(debug_img, (pb_x, pb_y), (pb_x + pb_w, pb_y + pb_h), (0, 255, 255), 3)
            cv2.putText(debug_img, f"PB", (pb_x, pb_y - 5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        # Step 4: Process each row
        plays = []
        valid_play_number = 1  # Sequential numbering for valid plays
        for row_idx, digit_row in enumerate(digit_rows):
            # Sort digits in row by X position (left to right)
            digit_row.sort(key=lambda d: d[0])

            # Get average Y for this row
            avg_y = sum(d[1] for d in digit_row) / len(digit_row)

            # Find the PB marker closest to this row's Y position
            closest_pb = None
            min_dist = float('inf')
            for pb_x, pb_y, pb_conf in pb_markers:
                pb_center_y = pb_y + pb_h // 2
                dist = abs(pb_center_y - avg_y)
                if dist < min_dist:
                    min_dist = dist
                    closest_pb = (pb_x, pb_y, pb_conf)

            if closest_pb is None:
                print(f"  Row {row_idx + 1}: No PB marker found, skipping")
                continue

            pb_x, pb_y, pb_conf = closest_pb

            print(f"  Row {row_idx + 1}: {len(digit_row)} digits at y≈{avg_y:.0f}, PB at x={pb_x}")

            # Separate digits by PB marker X position
            all_digits_before_pb = [(x, d, c) for x, y, d, c in digit_row if x < pb_x]
            all_digits_after_pb = [(x, d, c) for x, y, d, c in digit_row if x > pb_x + pb_w]

            # Sort by X position
            all_digits_before_pb.sort(key=lambda item: item[0])
            all_digits_after_pb.sort(key=lambda item: item[0])

            # Take only the LAST (rightmost) 10 digits before PB marker
            # Any digits further left are the play number and should be ignored
            white_ball_digits = all_digits_before_pb[-10:] if len(all_digits_before_pb) >= 10 else all_digits_before_pb

            # Take the FIRST (leftmost) 2 digits after PB marker for powerball
            powerball_digits = all_digits_after_pb[:2]

            # Debug: show raw digits for all rows
            print(f"    Before PB: {len(all_digits_before_pb)} total, using last 10")
            print(f"    After PB: {len(all_digits_after_pb)} total, using first 2")
            if len(white_ball_digits) > 0:
                print(f"    White ball digits (last 10): {[(x, d) for x, d, c in white_ball_digits]}")
            if len(powerball_digits) > 0:
                print(f"    Powerball digits (first 2): {[(x, d) for x, d, c in powerball_digits]}")

            # Reconstruct 2-digit numbers from individual digits
            # White balls: 10 digits -> 5 two-digit numbers
            white_balls = self._reconstruct_two_digit_numbers(white_ball_digits)

            # Powerball: 2 digits -> 1 two-digit number
            powerball_numbers = self._reconstruct_two_digit_numbers(powerball_digits)
            powerball = powerball_numbers[0] if powerball_numbers else None

            # Only keep valid plays (5 white balls + 1 powerball)
            is_valid_play = len(white_balls) == 5 and powerball is not None and 1 <= powerball <= 26

            if is_valid_play:
                # Check if all white balls are in valid range
                all_valid = all(1 <= num <= 69 for num in white_balls)
                is_valid_play = all_valid

            if is_valid_play:
                print(f"    ✓ VALID PLAY {valid_play_number}: White={white_balls}, PB={powerball}")
                play_number = valid_play_number
                valid_play_number += 1
            else:
                print(f"    → Incomplete/Invalid: {len(white_balls)} white balls, PB={powerball}")
                play_number = None

            # Draw digits on debug image
            for x, y, d, c in digit_row:
                if x < pb_x:
                    color = (0, 255, 0)  # Green for white balls
                else:
                    color = (255, 0, 255)  # Magenta for powerball
                cv2.putText(debug_img, str(d), (x, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

            # Only add valid plays to results
            if play_number is not None:
                play = {
                    'play_number': play_number,
                    'white': white_balls,
                    'powerball': powerball,
                    'confidence': 'high'
                }
                plays.append(play)

        # Save debug visualization
        self.save_debug_image("10_template_matching", debug_img)

        # Print final summary
        print(f"\n{'='*60}")
        print(f"EXTRACTED PLAYS SUMMARY")
        print(f"{'='*60}")
        if plays:
            for play in plays:
                white_str = ' '.join([f"{n:02d}" for n in play['white']])
                pb_str = f"{play['powerball']:02d}"
                print(f"  Play {play['play_number']}: {white_str} | PB {pb_str}")
        else:
            print("  No valid plays extracted")
        print(f"{'='*60}\n")

        self.profiler.end_step()
        return plays

    def _reconstruct_numbers(self, digits_list: List[Tuple[int, int, float]]) -> List[int]:
        """
        Reconstruct multi-digit numbers from individual digit detections.

        Args:
            digits_list: List of (x_position, digit_value, confidence)

        Returns:
            List of reconstructed numbers
        """
        if not digits_list:
            return []

        # Sort by x position
        digits_list.sort(key=lambda d: d[0])

        numbers = []
        current_number_digits = []
        last_x = -1000

        for x, digit, conf in digits_list:
            # If digits are close together (within 70px), they're part of same number
            if last_x > 0 and (x - last_x) > 70:
                # Complete current number and start new one
                if current_number_digits:
                    num = int(''.join(map(str, current_number_digits)))
                    numbers.append(num)
                    current_number_digits = []

            current_number_digits.append(digit)
            last_x = x

        # Add final number
        if current_number_digits:
            num = int(''.join(map(str, current_number_digits)))
            numbers.append(num)

        return numbers

    def _reconstruct_two_digit_numbers(self, digits_list: List[Tuple[int, int, float]]) -> List[int]:
        """
        Reconstruct 2-digit numbers from individual digit detections.
        Each number on a Powerball ticket is displayed as 2 digits (e.g., "05", "23").

        Args:
            digits_list: List of (x_position, digit_value, confidence)

        Returns:
            List of 2-digit numbers
        """
        if not digits_list:
            return []

        # Sort by x position (left to right)
        digits_list.sort(key=lambda d: d[0])

        numbers = []
        i = 0
        while i < len(digits_list):
            if i + 1 < len(digits_list):
                # Check if next digit is close enough to be part of same 2-digit number
                x1, d1, c1 = digits_list[i]
                x2, d2, c2 = digits_list[i + 1]

                # If digits are close (within 110px), they form a 2-digit number
                if x2 - x1 < 110:
                    number = d1 * 10 + d2
                    numbers.append(number)
                    i += 2  # Skip both digits
                    continue

            # If we get here, treat as single digit (shouldn't normally happen)
            _, digit, _ = digits_list[i]
            numbers.append(digit)
            i += 1

        return numbers

    def validate_play(self, play: Dict) -> Dict:
        """Validate and potentially correct a play."""
        # White balls: 5 unique numbers from 1-69
        # Powerball: 1 number from 1-26

        validated = play.copy()
        validated['valid'] = True
        validated['corrections'] = []

        white = play.get('white', [])
        powerball = play.get('powerball')

        # Check white balls
        if len(white) != 5:
            validated['valid'] = False
            validated['corrections'].append(f"Expected 5 white balls, got {len(white)}")

        if len(set(white)) != len(white):
            validated['valid'] = False
            validated['corrections'].append("White balls must be unique")

        for num in white:
            if not (1 <= num <= 69):
                validated['valid'] = False
                validated['corrections'].append(f"White ball {num} out of range (1-69)")

        # Check powerball
        if powerball is None or not (1 <= powerball <= 26):
            validated['valid'] = False
            validated['corrections'].append(f"Powerball {powerball} out of range (1-26)")

        return validated

    def process_ticket(self, image_path: str) -> Dict:
        """Process a complete ticket through the pipeline."""
        print(f"\n{'='*60}")
        print(f"Processing: {image_path}")
        print(f"{'='*60}\n")

        # Step 1: Load image (now returns binary image)
        binary = self.load_image(image_path)

        # Step 2: Normalize orientation using QR code
        normalized, orientation_info = self.normalize_orientation(binary)

        # Step 3: Find plays region
        plays_region, region_info = self.find_plays_region(normalized)

        if not region_info['found']:
            return {
                'success': False,
                'error': 'Could not find plays region',
                'details': region_info
            }

        # Step 4: Extract plays using template matching
        # (binarization already done in step 1)
        plays = self.extract_plays_template_matching(plays_region)

        # Step 5: Validate plays
        validated_plays = [self.validate_play(play) for play in plays]

        return {
            'success': True,
            'plays': validated_plays,
            'orientation_info': orientation_info,
            'region_info': region_info
        }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 ocr_pipeline_prototype.py <image_path>")
        print("\nExample:")
        print("  python3 ocr_pipeline_prototype.py ../IMG_5881.HEIC")
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.exists(image_path):
        print(f"Error: Image not found: {image_path}")
        sys.exit(1)

    # Create pipeline
    pipeline = TicketOCRPipeline()

    # Process ticket
    result = pipeline.process_ticket(image_path)

    # Save profiling data
    pipeline.profiler.save("pipeline_profile.json")

    # Print results
    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}\n")

    if result['success']:
        print(f"✓ Pipeline completed successfully")
        print(f"\nPlays extracted: {len(result['plays'])}")

        for i, play in enumerate(result['plays'], 1):
            if play['valid']:
                white = sorted(play['white'])
                print(f"  Play {i}: {white} PB {play['powerball']} ✓")
            else:
                print(f"  Play {i}: INVALID")
                for correction in play['corrections']:
                    print(f"    - {correction}")
    else:
        print(f"✗ Pipeline failed: {result['error']}")
        print(f"\nDetails: {result.get('details', {})}")

    # Print profiling summary
    print(f"\n{'='*60}")
    print("PROFILING")
    print(f"{'='*60}\n")

    with open("pipeline_profile.json", 'r') as f:
        profile = json.load(f)

    print(f"Total time: {profile['total_ms']:.2f}ms")
    print("\nStep breakdown:")
    for step, time_ms in sorted(profile['timings_ms'].items(), key=lambda x: -x[1]):
        pct = (time_ms / profile['total_ms']) * 100
        print(f"  {step:30s} {time_ms:8.2f}ms ({pct:5.1f}%)")

    print(f"\nIntermediate images saved to: {pipeline.output_dir}/")
    print(f"Profile data saved to: pipeline_profile.json")


if __name__ == '__main__':
    main()
