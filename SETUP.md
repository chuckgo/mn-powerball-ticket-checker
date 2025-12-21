# OCR Pipeline Prototype Setup

## Installation

### 1. Install Python (if not already installed)
```bash
# Check if Python 3 is installed
python3 --version

# If not installed, install Python 3.8 or higher
# On Ubuntu/WSL:
sudo apt update
sudo apt install python3 python3-pip python3-venv

# On macOS:
brew install python3

# On Windows:
# Download from python.org
```

### 2. Create a virtual environment (recommended)
```bash
cd /mnt/c/Users/chuck/Projects/mn-powerball-ticket-checker/mn-powerball-ticket-checker

# Create virtual environment
python3 -m venv venv

# Activate it
# On Linux/macOS/WSL:
source venv/bin/activate

# On Windows:
# venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

## Running the Prototype

```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Run the prototype on a test image
python3 ocr_pipeline_prototype.py path/to/ticket/image.heic

# Or run on all test images
python3 ocr_pipeline_prototype.py ../IMG_5881.HEIC
```

## Output

The script will create:
- `pipeline_output/` - Directory containing intermediate images for each processing step
- `pipeline_profile.json` - Timing information for each step
- Console output showing extracted plays and validation results

## Dependencies Explained

- **opencv-python**: Computer vision library for image processing, template matching, homography
- **numpy**: Numerical operations on images
- **pillow**: Image I/O
- **pillow-heif**: HEIC/HEIF image format support
