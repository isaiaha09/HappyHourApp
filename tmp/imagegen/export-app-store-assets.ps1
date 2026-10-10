$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputDirectory = 'C:\dev\HappyHourApp\output\imagegen\app-store-ready'
$assets = @(
    @{
        Source = 'C:\Users\isaia\.codex\generated_images\01a06400-7ebf-7081-9405-d622b78916b7\exec-ec00b859-2e90-4830-a987-3588954593f9.png'
        Name = 'DiningDealz-Header-3840x1646.png'
        Width = 3840
        Height = 1646
    },
    @{
        Source = 'C:\Users\isaia\.codex\generated_images\01a06400-7ebf-7081-9405-d622b78916b7\exec-c5296fb4-4226-4b06-aa44-4ffbc3eb7e76.png'
        Name = 'DiningDealz-Search-Results-1920x1280.png'
        Width = 1920
        Height = 1280
    }
)

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

foreach ($asset in $assets) {
    $destination = Join-Path $outputDirectory $asset.Name
    if (Test-Path -LiteralPath $destination) {
        throw "Refusing to overwrite an existing export: $destination"
    }

    $sourceImage = $null
    $bitmap = $null
    $graphics = $null
    $attributes = $null
    try {
        $sourceImage = [System.Drawing.Image]::FromFile($asset.Source)
        $bitmap = [System.Drawing.Bitmap]::new(
            [int]$asset.Width,
            [int]$asset.Height,
            [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
        )
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::Black)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
        $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $rectangle = [System.Drawing.Rectangle]::new(0, 0, [int]$asset.Width, [int]$asset.Height)
        $graphics.DrawImage(
            $sourceImage, $rectangle, 0, 0, $sourceImage.Width, $sourceImage.Height,
            [System.Drawing.GraphicsUnit]::Pixel, $attributes
        )
        $graphics.Dispose()
        $graphics = $null
        $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        if ($graphics) { $graphics.Dispose() }
        if ($attributes) { $attributes.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
        if ($sourceImage) { $sourceImage.Dispose() }
    }

    $verificationImage = [System.Drawing.Image]::FromFile($destination)
    try {
        $pngBytes = [System.IO.File]::ReadAllBytes($destination)
        if ($verificationImage.Width -ne $asset.Width -or $verificationImage.Height -ne $asset.Height) {
            throw "The saved file has incorrect dimensions: $destination"
        }
        if ($pngBytes[24] -ne 8 -or $pngBytes[25] -ne 2) {
            throw "The saved file is not an 8-bit RGB PNG without alpha: $destination"
        }
        [pscustomobject]@{
            Path = $destination
            Width = $verificationImage.Width
            Height = $verificationImage.Height
            PixelFormat = $verificationImage.PixelFormat.ToString()
            PngColorType = $pngBytes[25]
            Bytes = $pngBytes.Length
            Verified = $true
        } | ConvertTo-Json -Compress
    }
    finally {
        $verificationImage.Dispose()
    }
}
