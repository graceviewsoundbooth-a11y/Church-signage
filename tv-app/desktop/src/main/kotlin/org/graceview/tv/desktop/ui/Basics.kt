package org.graceview.tv.desktop.ui

// Ported from the TV app's ui/Basics.kt. Keep the two in step.

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.platform.Font
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

// ---- Design units --------------------------------------------------------
// Screens are designed at 1920x1080. u(px) converts a design pixel to Dp.

val LocalUnit = staticCompositionLocalOf { 1.dp }

@Composable
@ReadOnlyComposable
fun u(px: Number): Dp = LocalUnit.current * px.toFloat()

@Composable
@ReadOnlyComposable
fun us(px: Number): TextUnit = with(LocalDensity.current) { u(px).toSp() }

/**
 * A 1920x1080 canvas scaled to fit the window. On a screen that isn't 16:9 (a 16:10 or 4:3
 * projector) the extra space is filled with [fill], the theme's Main Color.
 */
@Composable
fun DesignCanvas(fill: Color = Color.Black, content: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().background(fill), contentAlignment = Alignment.Center) {
        val unit = minOf(maxWidth / 1920f, maxHeight / 1080f)
        val d = LocalDensity.current
        CompositionLocalProvider(LocalUnit provides unit, LocalDensity provides Density(d.density, 1f)) {
            Box(Modifier.size(unit * 1920f, unit * 1080f).clipToBounds()) { content() }
        }
    }
}

// ---- Fonts (the TV app's files, copied into resources/fonts at build) -----

val SourceSans = FontFamily(
    Font("fonts/sourcesans3_light.ttf", FontWeight(300)),
    Font("fonts/sourcesans3_regular.ttf", FontWeight(400)),
    Font("fonts/sourcesans3_semibold.ttf", FontWeight(600)),
    Font("fonts/sourcesans3_bold.ttf", FontWeight(700)),
)

val Montserrat = FontFamily(
    Font("fonts/montserrat_semibold.ttf", FontWeight(600)),
    Font("fonts/montserrat_bold.ttf", FontWeight(700)),
    Font("fonts/montserrat_extrabold.ttf", FontWeight(800)),
)

// ---- Text ----------------------------------------------------------------

/** Text sized in design pixels. lineHeight is a multiple of the font size, like CSS. */
@Composable
fun T(
    text: String,
    size: Number,
    modifier: Modifier = Modifier,
    weight: FontWeight = FontWeight.Normal,
    family: FontFamily = SourceSans,
    color: Color = Color.White,
    lineHeight: Float = 1.25f,
    letterSpacingEm: Float = 0f,
    maxLines: Int = Int.MAX_VALUE,
    align: TextAlign = TextAlign.Start,
) {
    BasicText(
        text = text,
        modifier = modifier,
        style = TextStyle(
            color = color,
            fontSize = us(size),
            fontWeight = weight,
            fontFamily = family,
            lineHeight = us(size.toFloat() * lineHeight),
            letterSpacing = if (letterSpacingEm != 0f) letterSpacingEm.em else TextUnit.Unspecified,
            textAlign = align,
            lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
        ),
        overflow = TextOverflow.Ellipsis,
        maxLines = maxLines,
    )
}

// ---- Images --------------------------------------------------------------

/** A JPG or PNG from disk (slides, logos), decoded off the UI thread. Draws nothing until it's loaded. */
@Composable
fun FileImage(file: File, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Fit) {
    val bmp by produceState<ImageBitmap?>(null, file) {
        value = withContext(Dispatchers.IO) {
            runCatching { org.jetbrains.skia.Image.makeFromEncoded(file.readBytes()).toComposeImageBitmap() }.getOrNull()
        }
    }
    bmp?.let { Image(it, contentDescription = null, modifier = modifier, contentScale = contentScale, filterQuality = FilterQuality.High) }
}
