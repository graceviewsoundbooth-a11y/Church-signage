package org.graceview.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import org.graceview.tv.R

// ---- Design units --------------------------------------------------------
// Screens are designed at 1920x1080. u(px) converts a design pixel to Dp at
// whatever resolution and density the stick reports.

val LocalUnit = staticCompositionLocalOf { 1.dp }

@Composable
@ReadOnlyComposable
fun u(px: Number): Dp = LocalUnit.current * px.toFloat()

@Composable
@ReadOnlyComposable
fun us(px: Number): TextUnit = with(LocalDensity.current) { u(px).toSp() }

/** A 1920x1080 canvas scaled to fit the screen, letterboxed in black. Ignores the system font scale. */
@Composable
fun DesignCanvas(content: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        val unit = minOf(maxWidth / 1920f, maxHeight / 1080f)
        val d = LocalDensity.current
        CompositionLocalProvider(LocalUnit provides unit, LocalDensity provides Density(d.density, 1f)) {
            Box(Modifier.size(unit * 1920f, unit * 1080f).clipToBounds()) { content() }
        }
    }
}

// ---- Fonts ---------------------------------------------------------------

// One static file per weight. Variable fonts don't load on Fire OS 6 (API 25).

val SourceSans = FontFamily(
    Font(R.font.sourcesans3_light, FontWeight(300)),
    Font(R.font.sourcesans3_regular, FontWeight(400)),
    Font(R.font.sourcesans3_semibold, FontWeight(600)),
    Font(R.font.sourcesans3_bold, FontWeight(700)),
)

val Montserrat = FontFamily(
    Font(R.font.montserrat_semibold, FontWeight(600)),
    Font(R.font.montserrat_bold, FontWeight(700)),
    Font(R.font.montserrat_extrabold, FontWeight(800)),
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
            platformStyle = PlatformTextStyle(includeFontPadding = false),
            lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
        ),
        overflow = TextOverflow.Ellipsis,
        maxLines = maxLines,
    )
}
