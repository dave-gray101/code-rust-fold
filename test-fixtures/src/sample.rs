use std::fmt;

// This is a multi-line line comment block.
// It should fold as a single comment region.
// Line three of this block.

/// Doc comment for Point.
/// Spans multiple lines to be foldable.
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Point { x, y }
    }

    pub fn distance(&self, other: &Point) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }
}

impl fmt::Display for Point {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}

/// Doc comment for the Shape trait.
pub trait Shape {
    fn area(&self) -> f64;
    fn perimeter(&self) -> f64;
    fn name(&self) -> &str;
}

pub struct Circle {
    pub center: Point,
    pub radius: f64,
}

impl Shape for Circle {
    fn area(&self) -> f64 {
        std::f64::consts::PI * self.radius * self.radius
    }

    fn perimeter(&self) -> f64 {
        2.0 * std::f64::consts::PI * self.radius
    }

    fn name(&self) -> &str {
        "Circle"
    }
}

pub enum Color {
    Red,
    Green,
    Blue,
    Custom(u8, u8, u8),
}

impl Color {
    pub fn to_rgb(&self) -> (u8, u8, u8) {
        match self {
            Color::Red => (255, 0, 0),
            Color::Green => (0, 255, 0),
            Color::Blue => (0, 0, 255),
            Color::Custom(r, g, b) => (*r, *g, *b),
        }
    }
}

pub mod geometry {
    use super::Point;

    pub fn midpoint(a: &Point, b: &Point) -> Point {
        Point {
            x: (a.x + b.x) / 2.0,
            y: (a.y + b.y) / 2.0,
        }
    }
}

macro_rules! print_info {
    ($name:expr, $value:expr) => {
        println!("{}: {:?}", $name, $value);
    };
}

pub fn top_level_function(shapes: &[Circle]) -> Vec<f64> {
    shapes.iter().map(|s| s.area()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_distance() {
        let p1 = Point::new(0.0, 0.0);
        let p2 = Point::new(3.0, 4.0);
        assert_eq!(p1.distance(&p2), 5.0);
    }

    #[test]
    fn test_circle_area() {
        let c = Circle {
            center: Point::new(0.0, 0.0),
            radius: 1.0,
        };
        assert!((c.area() - std::f64::consts::PI).abs() < 1e-10);
    }
}
