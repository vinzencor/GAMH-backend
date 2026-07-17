import Happening from "../models/Happening.js";

export const getHappenings = async (req, res, next) => {
  try {
    const happenings = await Happening.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: happenings });
  } catch (error) {
    next(error);
  }
};

export const createHappening = async (req, res, next) => {
  try {
    const { title, category, imageUrl, link, isActive } = req.body;
    const happening = new Happening({
      title,
      category,
      imageUrl,
      link,
      isActive,
      createdBy: req.user._id,
    });
    await happening.save();
    res.status(201).json({ success: true, message: "Happening created successfully", data: happening });
  } catch (error) {
    next(error);
  }
};

export const updateHappening = async (req, res, next) => {
  try {
    const { id } = req.params;
    const happening = await Happening.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!happening) {
      return res.status(404).json({ success: false, message: "Happening not found" });
    }
    res.json({ success: true, message: "Happening updated successfully", data: happening });
  } catch (error) {
    next(error);
  }
};

export const deleteHappening = async (req, res, next) => {
  try {
    const { id } = req.params;
    const happening = await Happening.findByIdAndDelete(id);
    if (!happening) {
      return res.status(404).json({ success: false, message: "Happening not found" });
    }
    res.json({ success: true, message: "Happening deleted successfully" });
  } catch (error) {
    next(error);
  }
};
